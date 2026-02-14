import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletOnboarding } from '../../features/wallet/components/WalletOnboarding';
import { LanguageProvider } from '../../contexts/LanguageContext';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('WalletOnboarding UI', () => {
  it('输入前确认按钮禁用，输入后可点击并触发导入', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const setInput = vi.fn();

    renderWithProvider(
      <WalletOnboarding
        input=""
        setInput={setInput}
        onImport={onImport}
        error={null}
        isExiting={false}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn).toBeDisabled();

    const textArea = screen.getByPlaceholderText('Private Key / Mnemonic');
    await user.type(textArea, 'test seed words');
    expect(setInput).toHaveBeenCalled();
  });

  it('语言切换后按钮文案会变化', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <WalletOnboarding
        input="dummy key"
        setInput={vi.fn()}
        onImport={vi.fn()}
        error={null}
        isExiting={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '中文' }));
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  });
});
