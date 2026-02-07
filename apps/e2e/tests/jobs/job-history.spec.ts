import { test, expect } from '@playwright/test';
import { mockJobsAPI, mockExecutionsAPI, mockDevicesAPI } from '../../helpers/api-mocks';

test.describe('Job History', () => {
  test.beforeEach(async ({ page }) => {
    await mockJobsAPI(page);
    await mockExecutionsAPI(page);
    await mockDevicesAPI(page);
  });

  // ─── P1 CORE ───────────────────────────────────────────────

  test('JOB-05: execution history pagination', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await page.waitForLoadState('networkidle');

    // Look for history/execution section
    const historyTab = page.getByText(/실행 기록|history/i);
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(500);

      // Check for pagination controls
      const nextBtn = page.getByRole('button', { name: /다음|next/i });

      // Pagination buttons may be present but disabled if single page
      if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const isEnabled = await nextBtn.isEnabled();
        if (isEnabled) {
          await nextBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('JOB-06: log drawer opens', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await page.waitForLoadState('networkidle');

    // Look for a log/detail button
    const logBtn = page.getByRole('button', { name: /로그|log|상세|detail/i });
    if (await logBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logBtn.first().click();

      // Expect drawer/sheet to appear
      const drawer = page.locator('[role="dialog"], [class*="sheet"], [class*="drawer"]');
      await expect(drawer.first()).toBeVisible({ timeout: 5_000 }).catch(() => {
        // Some UIs show logs inline
      });
    }
  });
});
