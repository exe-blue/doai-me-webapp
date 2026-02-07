import { test, expect } from '@playwright/test';
import { mockJobsAPI, mockDevicesAPI, mockDashboardAPIs } from '../../helpers/api-mocks';

test.describe('Socket Events', () => {
  // ─── P1 CORE ───────────────────────────────────────────────

  test('RT-01: socket connection indicator visible', async ({ page }) => {
    await mockJobsAPI(page, []);
    await mockDevicesAPI(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Check for connection indicator (green or red dot)
    const indicator = page.locator('.h-2.w-2.border-2, .h-3.w-3.border-2');
    await expect(indicator.first()).toBeVisible({ timeout: 10_000 });
  });

  // ─── P2 EXTENDED ───────────────────────────────────────────

  test('RT-02: connection status text shows correctly', async ({ page }) => {
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    // Check for connection status text
    const statusText = page.getByText(/연결됨|연결 끊김/);
    await expect(statusText.first()).toBeVisible({ timeout: 10_000 });
  });

  test('RT-03: system status section shows socket state', async ({ page }) => {
    await mockDashboardAPIs(page);
    await page.goto('/dashboard');

    // System status card
    const systemStatus = page.getByText('시스템 상태');
    await expect(systemStatus).toBeVisible({ timeout: 10_000 });

    // Socket.io status label
    const socketLabel = page.getByText(/Socket\.io/);
    await expect(socketLabel).toBeVisible();
  });
});
