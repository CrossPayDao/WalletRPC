import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { AddTokenModal, ChainModal, EditTokenModal } from '../../features/wallet/components/Modals';
import { ChainConfig } from '../../features/wallet/types';
import { TronService } from '../../services/tronService';
import * as rpcValidation from '../../services/rpcValidation';

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

const chain: ChainConfig = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: ['https://rpc.bittorrentchain.io', 'https://1rpc.io/btt'],
  currencySymbol: 'BTT',
  chainType: 'EVM',
  explorers: [
    {
      name: 'BttcScan',
      key: 'bttcscan',
      url: 'https://bttcscan.com',
      txPath: 'https://bttcscan.com/tx/{txid}',
      addressPath: 'https://bttcscan.com/address/{address}'
    }
  ],
  tokens: []
};

 describe('Modals UI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ChainModal 支持切换网络并保存配置', async () => {
    const user = userEvent.setup();
    const onSwitchNetwork = vi.fn();
    const onSave = vi.fn();

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain, { ...chain, id: 1, name: 'Ethereum Mainnet' }]}
        onSwitchNetwork={onSwitchNetwork}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], '1');
    expect(onSwitchNetwork).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('ChainModal 会拦截非 http(s) 的自定义 RPC URL', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'ftp://invalid');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('http(s)');
  });

  it('ChainModal 切换区块浏览器时链接应立即同步', async () => {
    const user = userEvent.setup();
    const chainWithExplorers: ChainConfig = {
      ...chain,
      defaultExplorerKey: 'bttcscan',
      explorers: [
        ...chain.explorers,
        {
          name: 'AltScan',
          key: 'altscan',
          url: 'https://alt.example',
          txPath: 'https://alt.example/tx/{txid}',
          addressPath: 'https://alt.example/address/{address}'
        }
      ]
    };

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chainWithExplorers}
        chains={[chainWithExplorers]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const websiteLink = screen.getByRole('link', { name: /Open Website/i });
    expect(websiteLink).toHaveAttribute('href', 'https://bttcscan.com');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[2], 'altscan');
    expect(websiteLink).toHaveAttribute('href', 'https://alt.example');
  });

  it('ChainModal 与 AddTokenModal 的 GitHub 链接应指向当前仓库', async () => {
    const user = userEvent.setup();

    const { unmount } = wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Technical Details/i }));
    const contributeLink = screen.getByRole('link', { name: /Contribute on GitHub/i });
    expect(contributeLink).toHaveAttribute('href', 'https://github.com/CrossPayDao/WalletRPC');

    unmount();
    wrap(<AddTokenModal isOpen={true} onClose={vi.fn()} onImport={vi.fn()} isImporting={false} />);
    const addLink = screen.getByRole('link', { name: /Add permanently via GitHub/i });
    expect(addLink).toHaveAttribute('href', 'https://github.com/CrossPayDao/WalletRPC');
  });

  it('AddTokenModal 可输入地址并触发导入', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    wrap(<AddTokenModal isOpen={true} onClose={vi.fn()} onImport={onImport} isImporting={false} />);

    await user.type(screen.getByPlaceholderText('0x...'), '0x00000000000000000000000000000000000000aa');
    await user.click(screen.getByRole('button', { name: 'Import Token' }));

    expect(onImport).toHaveBeenCalledWith('0x00000000000000000000000000000000000000aa');
  });

  it('EditTokenModal 可保存与删除', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    wrap(
      <EditTokenModal
        token={{ symbol: 'ABC', name: 'Alpha', address: '0x00000000000000000000000000000000000000ab', decimals: 18 }}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={onDelete}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('0x00000000000000000000000000000000000000ab');
  });

  it('关闭态 Modal 不应渲染内容', () => {
    const { container: chainContainer } = wrap(
      <ChainModal
        isOpen={false}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(chainContainer).toBeEmptyDOMElement();

    const { container: addContainer } = wrap(
      <AddTokenModal isOpen={false} onClose={vi.fn()} onImport={vi.fn()} isImporting={false} />
    );
    expect(addContainer).toBeEmptyDOMElement();

    const { container: editContainer } = wrap(
      <EditTokenModal token={null} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />
    );
    expect(editContainer).toBeEmptyDOMElement();
  });

  it('ChainModal 点击 open-console 时会先回调再关闭', async () => {
    const user = userEvent.setup();
    const onOpenConsole = vi.fn();
    const onClose = vi.fn();

    wrap(
      <ChainModal
        isOpen={true}
        onClose={onClose}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
        onOpenConsole={onOpenConsole}
      />
    );

    await user.click(screen.getByLabelText('open-console'));
    expect(onOpenConsole).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ChainModal 在 EVM RPC 校验失败时展示错误并阻止保存', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(rpcValidation, 'validateEvmRpcEndpoint').mockResolvedValue({
      ok: false,
      code: 'rpc_chainid_mismatch',
      expected: 199,
      got: 1
    } as any);

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://rpc.changed.local');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/expected 199, got 1/i);
  });

  it('ChainModal 在 TRON 探活失败时展示错误并阻止保存', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(TronService, 'normalizeHost').mockImplementation((v) => v.replace(/\/+$/, ''));
    vi.spyOn(TronService, 'probeRpc').mockResolvedValue({ ok: false, error: 'bad tron rpc' });

    const tronChain: ChainConfig = {
      ...chain,
      id: 728126428,
      chainType: 'TRON',
      defaultRpcUrl: 'https://nile.trongrid.io/',
      publicRpcUrls: ['https://nile.trongrid.io/']
    };

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={tronChain}
        chains={[tronChain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://nile.trongrid.io/new');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/bad tron rpc/i);
  });

  it('ChainModal 保存抛错时应展示错误信息', async () => {
    const user = userEvent.setup();
    vi.spyOn(rpcValidation, 'validateEvmRpcEndpoint').mockResolvedValue({ ok: true });
    const onSave = vi.fn(async () => {
      throw new Error('save exploded');
    });

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://rpc.changed.local');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('save exploded');
  });

  it('ChainModal 自定义 RPC 为空时阻止保存并提示必填', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/required/i);
  });

  it('ChainModal 在 EVM 探活返回 invalid scheme 码时展示对应错误', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(rpcValidation, 'validateEvmRpcEndpoint').mockResolvedValue({
      ok: false,
      code: 'rpc_url_invalid_scheme'
    } as any);

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://rpc.changed.local');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/http\(s\):\/\//i);
  });

  it('ChainModal EVM 探活返回未知错误码时使用 detail 兜底文案', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(rpcValidation, 'validateEvmRpcEndpoint').mockResolvedValue({
      ok: false,
      code: 'rpc_probe_failed',
      detail: 'connection refused'
    } as any);

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://rpc.changed.local');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/connection refused/i);
  });

  it('ChainModal 保存抛出非 Error 值时也能展示错误', async () => {
    const user = userEvent.setup();
    vi.spyOn(rpcValidation, 'validateEvmRpcEndpoint').mockResolvedValue({ ok: true } as any);
    const onSave = vi.fn(async () => {
      throw 'plain failure';
    });

    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={onSave}
      />
    );

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'custom');
    const rpcInput = screen.getByPlaceholderText('https://...');
    await user.clear(rpcInput);
    await user.type(rpcInput, 'https://rpc.changed.local');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('plain failure');
  });

  it('ChainModal 无 explorer 数据时显示空态文案', () => {
    const noExplorerChain: ChainConfig = { ...chain, explorers: [] };
    wrap(
      <ChainModal
        isOpen={true}
        onClose={vi.fn()}
        initialConfig={noExplorerChain}
        chains={[noExplorerChain]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText(/no explorers/i)).toBeInTheDocument();
  });

  it('ChainModal 无 onOpenConsole 时点击按钮仍应关闭弹窗', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    wrap(
      <ChainModal
        isOpen={true}
        onClose={onClose}
        initialConfig={chain}
        chains={[chain]}
        onSwitchNetwork={vi.fn()}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText('open-console'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
