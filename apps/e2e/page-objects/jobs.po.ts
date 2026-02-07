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
    title?: string;
    videoUrl: string;
    duration?: number;
  }) {
    await this.clickNewJob();

    // Wait for dialog/form to appear
    const dialog = this.page.locator('[role="dialog"], form').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in URL (look for URL input)
    const urlInput = this.page.locator('input[placeholder*="youtube"], input[placeholder*="URL"], input[name*="url"]').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill(options.videoUrl);
    }

    // Fill title if provided
    if (options.title) {
      const titleInput = this.page.locator('input[name*="title"], input[placeholder*="제목"]').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill(options.title);
      }
    }

    // Submit
    const submitBtn = dialog.locator('button[type="submit"], button:has-text("생성"), button:has-text("등록")').first();
    await submitBtn.click();
  }

  async refresh() {
    await this.refreshButton.click();
  }

  async expectSocketConnected() {
    await expect(this.socketIndicator.first()).toBeVisible();
  }
}
