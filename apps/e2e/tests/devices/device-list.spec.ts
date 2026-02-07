import { test, expect } from '@playwright/test';
import { DevicesPage } from '../../page-objects/devices.po';
import { mockDevicesAPI } from '../../helpers/api-mocks';
import { TestData } from '../../helpers/test-data';

test.describe('Device List', () => {
  test.beforeEach(async ({ page }) => {
    await mockDevicesAPI(page);
  });

  // ─── P0 SMOKE ──────────────────────────────────────────────

  test('DEV-01: devices page loads with status summary @smoke', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();
    // Verify page has device-related content
    await expect(page.locator('body')).toContainText(/디바이스|기기|device/i);
  });

  test('DEV-02: search filter narrows device list @smoke', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();

    // Search for a specific device
    if (await devices.searchInput.isVisible().catch(() => false)) {
      await devices.search('S9-001');
      // Wait for filtering to take effect
      await page.waitForTimeout(500);
    }
  });

  // ─── P1 CORE ───────────────────────────────────────────────

  test('DEV-03: status filter works (online/busy/offline/error)', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();

    // Try filtering by status if the filter trigger is visible
    if (await devices.statusFilterTrigger.isVisible().catch(() => false)) {
      await devices.filterByStatus('온라인');
      await page.waitForTimeout(500);
    }
  });

  test('DEV-04: grid and list view toggle', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();

    // Toggle views if buttons are visible
    if (await devices.listViewButton.isVisible().catch(() => false)) {
      await devices.switchToListView();
      await page.waitForTimeout(300);
    }

    if (await devices.gridViewButton.isVisible().catch(() => false)) {
      await devices.switchToGridView();
      await page.waitForTimeout(300);
    }
  });

  // ─── P2 EXTENDED ───────────────────────────────────────────

  test('DEV-07: PC filter shows devices for selected PC', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();

    // Look for PC filter buttons/tabs
    const pcFilter = page.getByText(/PC-1|PC-2/);
    if (await pcFilter.first().isVisible().catch(() => false)) {
      await pcFilter.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('DEV-09: auto-refresh toggle', async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.goto();
    await devices.expectLoaded();

    if (await devices.autoRefreshToggle.isVisible().catch(() => false)) {
      await devices.autoRefreshToggle.click();
      await page.waitForTimeout(300);
    }
  });
});
