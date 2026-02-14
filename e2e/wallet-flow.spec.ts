import { expect, test } from '@playwright/test';
import { installBttcRpcMock } from './helpers/evmRpcMock';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const TRACKED_SAFE = '0x000000000000000000000000000000000000dEaD';

const importToDashboard = async (page: import('@playwright/test').Page) => {
  await installBttcRpcMock(page);
  await page.goto('/?e2e=1');
  await page.getByPlaceholder('Private Key / Mnemonic').fill(TEST_MNEMONIC);
  await page.getByRole('button', { name: 'Confirm' }).click();
  try {
    await expect(page.getByRole('button', { name: /KILL_SIG|结束会话/i })).toBeVisible({ timeout: 20000 });
  } catch (e) {
    const body = (await page.textContent('body')) || '';
    throw new Error(`未进入主应用视图。页面片段: ${body.slice(0, 400)}`);
  }
};

const openHeaderAccountMenu = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /MASTER KEY|主密钥|TRON NODE/i }).click();
};

const switchNetwork = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByRole('button', { name: 'open-network-settings' }).click();
  await page.locator('select').first().selectOption({ label });
  await page.getByRole('button', { name: /SAVE CHANGES|保存更改/i }).click();
};

test.describe('Wallet Flow (Mocked RPC)', () => {
  test('导入后进入 Dashboard 并可切换到发送页', async ({ page }) => {
    await importToDashboard(page);

    await expect(page.getByText(/Total Net Worth|资产总净值/)).toBeVisible();
    await expect(page.locator('button', { hasText: /SEND|发送/i }).first()).toBeVisible();

    await page.locator('button', { hasText: /SEND|发送/i }).first().click();
    await expect(page.getByText(/Broadcast Transaction|广播交易指令/)).toBeVisible();
    await expect(page.getByRole('button', { name: /BROADCAST_TRANSACTION|广播交易/i })).toBeDisabled();
  });

  test('发送流程可进入成功状态并返回 Dashboard', async ({ page }) => {
    await importToDashboard(page);
    await page.locator('button', { hasText: /SEND|发送/i }).first().click();

    await page.getByPlaceholder('0x...').fill('0x000000000000000000000000000000000000dEaD');
    await page.getByPlaceholder('0.0').fill('0.1');

    const sendBtn = page.getByRole('button', { name: /BROADCAST_TRANSACTION|广播交易/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    await expect(page.getByText(/Transmission Confirmed|传输已确认/)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /RETURN_TO_BASE|返回主界面/ }).click();
    await expect(page.locator('button', { hasText: /SEND|发送/i }).first()).toBeVisible();
  });

  test('可导入自定义 Token 并完成编辑删除', async ({ page }) => {
    await importToDashboard(page);

    await page.getByRole('button', { name: /IMPORT_TOKEN|IMPORT TOKEN|导入代币/i }).click();
    await page.getByPlaceholder('0x...').fill('0x00000000000000000000000000000000000000aa');
    await page.getByRole('button', { name: /IMPORT_TOKEN|IMPORT TOKEN|导入代币/i }).last().click();

    await expect(page.getByText(/Imported MCK successfully/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/MOCK TOKEN|Mock Token/i).first()).toBeVisible();

    await page.getByText(/MOCK TOKEN|Mock Token/i).first().click();
    const symbolInput = page.getByRole('textbox').first();
    await symbolInput.fill('MCK2');
    await page.getByRole('button', { name: /SAVE CHANGES|保存/i }).click();
    await expect(page.getByText(/Token updated/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('MCK2')).toBeVisible();

    await page.getByText(/MOCK TOKEN|Mock Token/i).first().click();
    await page.getByRole('button', { name: /DELETE|删除/i }).click();
    await expect(page.getByText(/Token removed/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('MCK2')).toHaveCount(0);
  });

  test('可跟踪 Safe 并切换到 SAFE 视图访问队列和设置', async ({ page }) => {
    await importToDashboard(page);

    await openHeaderAccountMenu(page);
    await page.getByRole('button', { name: /^IMPORT$/i }).click();
    await expect(page.getByRole('heading', { name: /SYNC EXISTING|同步现有/i })).toBeVisible();

    await page.getByPlaceholder('0x...').fill(TRACKED_SAFE);
    await page.getByRole('button', { name: /INITIATE|同步/i }).click();

    await expect(page.locator('button', { hasText: /QUEUE|队列/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /MOD|设置/i }).first()).toBeVisible();

    await page.locator('button', { hasText: /QUEUE|队列/i }).first().click();
    await expect(page.getByText(/ALL CLEAR|全部清空|无待处理/i)).toBeVisible();

    await page.locator('main').getByRole('button').first().click();
    await expect(page.locator('button', { hasText: /QUEUE|队列/i }).first()).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: /Node Master|Safe_/i }).first()).toBeVisible();
  });

  test('切换网络时会自动退出 SAFE 上下文', async ({ page }) => {
    await importToDashboard(page);

    await openHeaderAccountMenu(page);
    await page.getByRole('button', { name: /^IMPORT$/i }).click();
    await page.getByPlaceholder('0x...').fill(TRACKED_SAFE);
    await page.getByRole('button', { name: /INITIATE|同步/i }).click();

    await expect(page.locator('button', { hasText: /QUEUE|队列/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /MOD|设置/i }).first()).toBeVisible();

    await page.getByRole('button', { name: 'open-network-settings' }).click();
    await page.locator('select').first().selectOption({ label: 'Ethereum Mainnet' });
    await page.getByRole('button', { name: /SAVE CHANGES|保存更改/i }).click();

    await expect(page.locator('button', { hasText: /QUEUE|队列/i })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /MOD|设置/i })).toHaveCount(0);
    await expect(page.locator('header').getByRole('button', { name: /MASTER KEY|主密钥/i }).first()).toBeVisible();
  });

  test('登出会清空会话并回到干净的 onboarding 页面', async ({ page }) => {
    await importToDashboard(page);

    await page.getByRole('button', { name: /KILL_SIG|结束会话/i }).click();
    await expect(page.getByPlaceholder('Private Key / Mnemonic')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm|确认/i })).toBeDisabled();
  });

  test('删除当前链 Safe 不会误删其他链同地址记录', async ({ page }) => {
    await importToDashboard(page);

    await openHeaderAccountMenu(page);
    await page.getByRole('button', { name: /^IMPORT$/i }).click();
    await page.getByPlaceholder('0x...').fill(TRACKED_SAFE);
    await page.getByRole('button', { name: /INITIATE|同步/i }).click();

    await switchNetwork(page, 'Ethereum Mainnet');
    await openHeaderAccountMenu(page);
    await page.getByRole('button', { name: /^IMPORT$/i }).click();
    await page.getByPlaceholder('0x...').fill(TRACKED_SAFE);
    await page.getByRole('button', { name: /INITIATE|同步/i }).click();

    await switchNetwork(page, 'BitTorrent Chain');
    await openHeaderAccountMenu(page);
    const safeEntry = page.getByRole('button', { name: 'Safe_0000' }).first();
    await expect(safeEntry).toBeVisible();
    await safeEntry.locator('xpath=../button[2]').click();

    await switchNetwork(page, 'Ethereum Mainnet');
    await openHeaderAccountMenu(page);
    await expect(page.getByText(/Safe_0000/i).first()).toBeVisible();
  });

});
