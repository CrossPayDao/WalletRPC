import { expect, test } from '@playwright/test';
import { installBttcRpcJsonRpcErrorMock } from './helpers/evmRpcMock';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

test.describe('Error UX', () => {
  test('重复触发相同数据同步错误时不应出现多条重复提示', async ({ page }) => {
    await installBttcRpcJsonRpcErrorMock(page, -32005, 'rate limited');
    await page.goto('/?e2e=1');

    await page.getByPlaceholder('Private Key / Mnemonic').fill(TEST_MNEMONIC);
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('button', { name: /KILL_SIG|结束会话/i })).toBeVisible({ timeout: 20000 });

    // 快速连续点击刷新，触发多次 fetchData(true) -> setError(...)
    const refresh = page.getByLabel('refresh-balance');
    for (let i = 0; i < 5; i++) {
      await refresh.click();
    }

    // 具体文案可能因错误归一化而变化，但 UX 要求是“只出现一条错误提示”
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toHaveCount(1);
  });
});
