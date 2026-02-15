import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { HttpConsoleProvider, useHttpConsole } from '../../contexts/HttpConsoleContext';

const Harness: React.FC = () => {
  const c = useHttpConsole();
  return (
    <div>
      <button onClick={() => c.open()}>open</button>
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

    expect(screen.queryByLabelText('http-console-dock')).toBeNull();

    await user.click(screen.getByText('open'));

    // Expanded view renders ConsoleView title (depends on default language).
    expect(await screen.findByText(/Console|控制台/)).toBeTruthy();

    await user.click(screen.getByLabelText('console-minimize'));
    expect(await screen.findByLabelText('http-console-dock')).toBeTruthy();
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
});
