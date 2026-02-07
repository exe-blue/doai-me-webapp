import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.po';

export class JobsPage extends BasePage {
  readonly newJobButton: Locator;
  readonly refreshButton: Locator;
  readonly queueSection: Locator;
  readonly historySection: Locator;
  readonly socketIndicator: Locator;
  readonly jobItems: Locator;

  constructor(page: Page) {
    super(page);
    this.newJobButton = page.getByRole('button', { name: /새 작업/ });
    this.refreshButton = page.getByRole('button', { name: /새로고침/ });
    this.queueSection = page.getByText('작업 큐');
    this.historySection = page.getByText('실행 기록');
    this.socketIndicator = page.locator('.h-2.w-2.border-2');
    this.jobItems = page.locator('[class*="border"]').filter({ hasText: /active|pending|running/ });
  }

  async goto() {
    await this.page.goto('/dashboard/jobs');
  }

  async expectLoaded() {
    await expect(this.queueSection).toBeVisible({ timeout: 15_000 });
  }

  async clickNewJob() {
    await this.newJobButton.click();
  }

  async createJob(options: {
    channelName: string;
    videoUrl: string;
    duration?: number;
  }) {
    await this.clickNewJob();

    // Wait for dialog to appear
    const dialog = this.page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill YouTube URL
    const urlInput = dialog.locator('input[placeholder*="youtube.com"]').first();
    await urlInput.fill(options.videoUrl);

    // Fill channel name (required)
    const channelInput = dialog.locator('input[placeholder*="짐승남"]').first();
    await channelInput.fill(options.channelName);

    // Submit — button text is "Create Job"
    // Button may be disabled when no idle devices are available via socket context,
    // but the mocked POST handler will still return success.
    // Use dispatchEvent because the dialog scroll container prevents viewport-based clicks.
    const submitBtn = dialog.getByRole('button', { name: /Create Job/i });
    await submitBtn.dispatchEvent('click');
  }

  async refresh() {
    await this.refreshButton.click();
  }

  async expectSocketConnected() {
    await expect(this.socketIndicator.first()).toBeVisible();
  }
}
