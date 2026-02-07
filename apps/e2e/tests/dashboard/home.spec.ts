import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../page-objects/dashboard.po';
import { mockDashboardAPIs } from '../../helpers/api-mocks';

test.describe('Dashboard Home', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page);
  });

  // ─── P0 SMOKE ──────────────────────────────────────────────

  test('DASH-01: dashboard loads with stat cards @smoke', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectStatCardsVisible();
  });

  // ─── P1 CORE ───────────────────────────────────────────────

  test('DASH-02: quick links navigate to correct pages', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectQuickLinksVisible();

    // Test 기기관리 link
    await dashboard.clickQuickLink('기기관리');
    await expect(page).toHaveURL(/\/dashboard\/nodes/);
    await page.goBack();

    // Test 작업관리 link
    await dashboard.clickQuickLink('작업관리');
    await expect(page).toHaveURL(/\/dashboard\/jobs/);
    await page.goBack();

    // Test 작업등록 link
    await dashboard.clickQuickLink('작업등록');
    await expect(page).toHaveURL(/\/dashboard\/register/);
  });
});
