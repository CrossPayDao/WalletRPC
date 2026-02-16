import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { HttpConsoleProvider, useHttpConsole } from '../../contexts/HttpConsoleContext';
import { ethers } from 'ethers';

const Harness: React.FC = () => {
  const c = useHttpConsole();
  return (
    <div>
      <button onClick={() => c.open()}>open</button>
      <button onClick={() => c.clear()}>clear</button>
    </div>
  );
};

describe('HttpConsole dock', () => {
  it('open() 后应展示悬浮控制台并可收起', async () => {
    // Ensure fetch exists for the patching logic when enabled.
    (globalThis as any).fetch = vi.fn(async () => {
      return {
        status: 200,
        clone: () => ({ text: async () => 'ok' }),
        text: async () => 'ok'
      } as any;
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );

    expect(screen.queryByLabelText('http-console-fab')).toBeNull();

    await user.click(screen.getByText('open'));

    // Expanded view renders ConsoleView title (depends on default language).
    expect(await screen.findByText(/Console|控制台/)).toBeTruthy();

    await user.click(screen.getByLabelText('console-minimize'));
    expect(await screen.findByLabelText('http-console-fab')).toBeTruthy();
  });

  it('batch RPC 应拆分为多条语义化请求', async () => {
    const origFetch = vi.fn(async () => {
      const body = JSON.stringify([
        { jsonrpc: '2.0', id: 1, result: { number: '0x10' } },
        { jsonrpc: '2.0', id: 2, result: '0xdeadbeef' }
      ]);
      return {
        status: 200,
        clone: () => ({ text: async () => body }),
        text: async () => body
      } as any;
    });
    (globalThis as any).fetch = origFetch;

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );

    await user.click(screen.getByText('open'));

    const batchReq = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] },
      { jsonrpc: '2.0', id: 2, method: 'eth_sendRawTransaction', params: ['0x' + 'ab'.repeat(200)] }
    ]);
    await act(async () => {
      await (window.fetch as any)('https://rpc.example', { method: 'POST', body: batchReq });
    });

    // 期望至少出现两条语义化行为（区块查询 + 广播交易），并带有 Batch/批请求 前缀。
    const batchRows = await screen.findAllByText(/Batch\(2\)|批请求\(2\)/);
    expect(batchRows.length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText(/Get block|查询区块/)).toBeTruthy();
    expect(await screen.findByText(/Broadcast transaction|广播交易/)).toBeTruthy();
  });

  it('应记录 HTTP 与 TRON REST 语义，并在请求失败时写入错误事件', async () => {
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      const method = String(init?.method || 'GET').toUpperCase();
      if (url.includes('/wallet/getaccount')) {
        return {
          status: 200,
          clone: () => ({ text: async () => JSON.stringify({ balance: 1 }) }),
          text: async () => JSON.stringify({ balance: 1 })
        } as any;
      }
      if (method === 'OPTIONS') {
        return {
          status: 204,
          clone: () => ({ text: async () => '' }),
          text: async () => ''
        } as any;
      }
      if (url.includes('/rpc-fail')) {
        throw new Error('boom');
      }
      return {
        status: 200,
        clone: () => ({ text: async () => '<html></html>' }),
        text: async () => '<html></html>'
      } as any;
    });
    (globalThis as any).fetch = fetchMock;

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );

    await user.click(screen.getByText('open'));

    await act(async () => {
      await (window.fetch as any)('https://site.test/index.html', { method: 'GET' });
      await (window.fetch as any)('https://site.test/asset.js', { method: 'GET' });
      await (window.fetch as any)('https://nile.trongrid.io/wallet/getaccount', { method: 'POST', body: '{}' });
      await (window.fetch as any)('https://site.test/cors', { method: 'OPTIONS' });
      await expect(
        (window.fetch as any)('https://site.test/rpc-fail', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
        })
      ).rejects.toThrow('boom');
    });

    expect(await screen.findByText(/Load page|加载页面/)).toBeTruthy();
    expect(await screen.findByText(/Fetch TRON account|查询 TRON 账户余额/)).toBeTruthy();
    expect(await screen.findByText(/CORS preflight|预检请求|HTTP request|HTTP 请求/)).toBeTruthy();
  });

  it('XHR 批量 RPC 也应拆分为多条请求并支持 clear()', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => '{}' }),
      text: async () => '{}'
    }));
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(function (this: XMLHttpRequest) {
      return undefined as any;
    });
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperty(this, 'status', { configurable: true, value: 200 });
      Object.defineProperty(this, 'responseText', {
        configurable: true,
        value: JSON.stringify([
          { jsonrpc: '2.0', id: 1, result: '0x1' },
          { jsonrpc: '2.0', id: 2, result: { status: 'ok' } }
        ])
      });
      this.dispatchEvent(new Event('loadend'));
      return undefined as any;
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );
    await user.click(screen.getByText('open'));

    await act(async () => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://rpc.example');
      xhr.send(
        JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: ['0xabc', 'latest'] },
          { jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: ['0xdef'] }
        ])
      );
    });

    const rows = await screen.findAllByText(/Batch\(2\)|批请求\(2\)/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByText('clear'));
    expect(screen.queryAllByText(/Batch\(2\)|批请求\(2\)/)).toHaveLength(0);

    openSpy.mockRestore();
    sendSpy.mockRestore();
  });

  it('eth_call(getOwners) 应生成 SAFE 语义并可在详情中解析 owners 数量', async () => {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const responseBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: coder.encode(
        ['address[]'],
        [[
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002'
        ]]
      )
    });
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => responseBody }),
      text: async () => responseBody
    }));
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );

    await user.click(screen.getByText('open'));
    await act(async () => {
      await (window.fetch as any)('https://rpc.example', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ data: '0xa0e67e2b' }, 'latest']
        })
      });
    });

    await user.click(await screen.findByRole('button', { name: /SAFE owners|Safe owners|查询 Safe 成员/i }));
    expect(await screen.findByText('2')).toBeTruthy();
  });

  it('eth_sendRawTransaction 应对原始签名参数做脱敏', async () => {
    const responseBody = JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' + 'a'.repeat(64) });
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => responseBody }),
      text: async () => responseBody
    }));
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );

    await user.click(screen.getByText('open'));
    await act(async () => {
      await (window.fetch as any)('https://rpc.example', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: ['0x' + 'ab'.repeat(256)]
        })
      });
    });

    await user.click(await screen.findByRole('button', { name: /Broadcast transaction|广播交易/i }));
    expect(await screen.findByText(/\[redacted\]/i)).toBeTruthy();
  });

  it('batch RPC 在响应非数组与 item 缺少 method 时仍应记录事件', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => JSON.stringify({ not: 'array' }) }),
      text: async () => JSON.stringify({ not: 'array' })
    }));

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );
    await user.click(screen.getByText('open'));

    await act(async () => {
      await (window.fetch as any)('https://rpc.example', {
        method: 'POST',
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, params: [] },
          { jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: ['0x1', 'latest'] }
        ])
      });
    });

    const rows = await screen.findAllByText(/Batch\(2\)|批请求\(2\)/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('事件数量超过上限时应裁剪到 5000 条', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => '{}' }),
      text: async () => '{}'
    }));

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );
    await user.click(screen.getByText('open'));
    await user.click(screen.getByLabelText('console-minimize'));

    await act(async () => {
      for (let i = 0; i < 5005; i++) {
        await (window.fetch as any)(`https://site.test/asset-${i}.js`, { method: 'GET' });
      }
    });

    expect(await screen.findByText('5000')).toBeTruthy();
  });

  it('batch RPC 请求失败时也应拆分记录错误事件', async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error('batch boom');
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );
    await user.click(screen.getByText('open'));

    await act(async () => {
      await expect(
        (window.fetch as any)('https://rpc.example', {
          method: 'POST',
          body: JSON.stringify([
            { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
            { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['latest', false] }
          ])
        })
      ).rejects.toThrow('batch boom');
    });

    const rows = await screen.findAllByText(/Batch\(2\)|批请求\(2\)/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('XHR 单条 RPC 请求应记录语义事件', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      status: 200,
      clone: () => ({ text: async () => '{}' }),
      text: async () => '{}'
    }));
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(function (this: XMLHttpRequest) {
      return undefined as any;
    });
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperty(this, 'status', { configurable: true, value: 200 });
      Object.defineProperty(this, 'responseText', {
        configurable: true,
        value: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' })
      });
      this.dispatchEvent(new Event('loadend'));
      return undefined as any;
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <HttpConsoleProvider>
          <Harness />
        </HttpConsoleProvider>
      </LanguageProvider>
    );
    await user.click(screen.getByText('open'));

    await act(async () => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://rpc.example');
      xhr.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: ['0xabc'] }));
    });

    expect(await screen.findByText(/Get receipt|查询回执/)).toBeTruthy();
    openSpy.mockRestore();
    sendSpy.mockRestore();
  });
});
