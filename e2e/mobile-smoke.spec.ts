import { expect, test } from '@playwright/test';
import { installBttcRpcMock } from './helpers/evmRpcMock';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

test.describe('Mobile Smoke', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('onboarding + dashboard are usable on a mobile viewport', async ({ page }) => {
    await installBttcRpcMock(page);
    await page.goto('/?e2e=1');

    // Onboarding: language toggle should remain reachable on small screens.
    await expect(page.getByRole('button', { name: '中文' })).toBeVisible();
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('button', { name: '确认' })).toBeVisible();

    // Import and land on dashboard.
    await page.locator('textarea').fill(TEST_MNEMONIC);
    await page.getByRole('button', { name: /Confirm|确认/i }).click();

    await expect(page.getByText(/Total Net Worth|资产总净值/i)).toBeVisible({ timeout: 10000 });

    // Settings modal should open and be scrollable within the viewport.
    await page.getByRole('button', { name: 'open-network-settings' }).click();
    await expect(page.getByText(/Settings|设置/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /SAVE CHANGES|保存更改/i })).toBeVisible();
  });
});
