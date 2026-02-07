import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.po';

export class QueuePage extends BasePage {
  readonly queueItems: Locator;
  readonly emptyState: Locator;
  readonly paginationPrev: Locator;
  readonly paginationNext: Locator;

  constructor(page: Page) {
    super(page);
    this.queueItems = page.locator('table tbody tr, [class*="queue-item"]');
    this.emptyState = page.getByText(/비어|없음|no.*items/i);
    this.paginationPrev = page.getByRole('button', { name: /이전|prev/i });
    this.paginationNext = page.getByRole('button', { name: /다음|next/i });
  }

  async goto() {
    await this.page.goto('/dashboard/queue');
  }

  async expectLoaded() {
    await this.page.waitForLoadState('networkidle');
  }

  async getItemCount(): Promise<number> {
    return this.queueItems.count();
  }
}
