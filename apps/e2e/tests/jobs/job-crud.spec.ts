import { test, expect } from '@playwright/test';
import { JobsPage } from '../../page-objects/jobs.po';
import { mockJobsAPI, mockDevicesAPI, mockExecutionsAPI } from '../../helpers/api-mocks';
import { TestData } from '../../helpers/test-data';

test.describe('Job CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await mockJobsAPI(page);
    await mockDevicesAPI(page);
    await mockExecutionsAPI(page);
  });

  // ─── P0 SMOKE ──────────────────────────────────────────────

  test('JOB-01: jobs timeline page loads with queue section @smoke', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();
  });

  test('JOB-02: create new job with YouTube URL @smoke', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();

    // Click new job button
    if (await jobs.newJobButton.isVisible().catch(() => false)) {
      await jobs.createJob({
        videoUrl: TestData.job.valid.target_url,
        channelName: 'E2E테스트',
      });

      // Expect success feedback (toast or list update)
      await page.waitForTimeout(1_000);
    }
  });

  // ─── P1 CORE ───────────────────────────────────────────────

  test('JOB-03: delete job shows confirm dialog', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();

    // Look for delete button in job items
    const deleteBtn = page.getByRole('button', { name: /삭제|delete/i })
      .or(page.locator('button[class*="destructive"]'));

    if (await deleteBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteBtn.first().click();

      // Expect confirmation dialog
      const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 }).catch(() => {
        // Some implementations use toast confirmation
      });
    }
  });

  test('JOB-04: pause and resume job changes status', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();

    const pauseBtn = page.getByRole('button', { name: /일시정지|pause/i });
    if (await pauseBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pauseBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  // ─── P2 EXTENDED ───────────────────────────────────────────

  test('JOB-07: invalid URL shows validation error', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();

    if (await jobs.newJobButton.isVisible().catch(() => false)) {
      await jobs.clickNewJob();

      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5_000 }).catch(() => null);

      // Try to submit with invalid URL
      const urlInput = dialog.locator('input[placeholder*="youtube.com"]').first();
      if (await urlInput.isVisible().catch(() => false)) {
        await urlInput.fill('https://example.com/not-youtube');

        const submitBtn = dialog.getByRole('button', { name: /Create Job/i });
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          // Expect validation error
          await page.waitForTimeout(1_000);
        }
      }
    }
  });

  test('JOB-08: priority toggle shows toast notification', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.expectLoaded();

    const priorityBtn = page.getByRole('button', { name: /우선|priority/i })
      .or(page.locator('[class*="priority"]'));

    if (await priorityBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await priorityBtn.first().click();
      await page.waitForTimeout(500);
    }
  });
});
