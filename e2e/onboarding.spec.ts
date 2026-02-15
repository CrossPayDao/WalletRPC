import { expect, test } from '@playwright/test';
import { installBttcRpcMock } from './helpers/evmRpcMock';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

test.describe('Wallet RPC Onboarding', () => {
  test('支持语言切换并展示导入错误', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByPlaceholder('Private Key / Mnemonic')).toBeVisible();
    const confirmBtn = page.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    await page.getByRole('button', { name: '中文' }).click();
    const zhConfirm = page.getByRole('button', { name: '确认' });
    await expect(zhConfirm).toBeVisible();

    await expect(page.getByPlaceholder('私钥 / 助记词')).toBeVisible();
    await page.locator('textarea').fill('invalid mnemonic');
    await expect(zhConfirm).toBeEnabled();
    await zhConfirm.click();
    await expect(page.getByText('Invalid Key/Mnemonic')).toBeVisible();
  });

  test('有效助记词导入后应平滑快速进入主界面', async ({ page }) => {
    await installBttcRpcMock(page);
    await page.goto('/');
    await page.getByPlaceholder('Private Key / Mnemonic').fill(TEST_MNEMONIC);
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('button', { name: /KILL_SIG|结束会话/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Total Net Worth|资产总净值/i)).toBeVisible({ timeout: 5000 });
  });
});
