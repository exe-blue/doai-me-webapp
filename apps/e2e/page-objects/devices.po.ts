import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.po';

export class DevicesPage extends BasePage {
  readonly searchInput: Locator;
  readonly statusFilterTrigger: Locator;
  readonly gridViewButton: Locator;
  readonly listViewButton: Locator;
  readonly deviceCards: Locator;
  readonly autoRefreshToggle: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.locator('input[placeholder*="검색"]');
    this.statusFilterTrigger = page.getByText('전체 상태');
    this.gridViewButton = page.getByRole('button').filter({ has: page.locator('svg.lucide-layout-grid') });
    this.listViewButton = page.getByRole('button').filter({ has: page.locator('svg.lucide-list') });
    this.deviceCards = page.locator('[class*="cursor-pointer"]').filter({ has: page.locator('[class*="badge"], [class*="Badge"]') });
    this.autoRefreshToggle = page.getByText('자동 갱신');
  }

  async goto() {
    await this.page.goto('/dashboard/devices');
  }

  async expectLoaded() {
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async filterByStatus(status: '온라인' | '작업중' | '오류' | '오프라인') {
    await this.statusFilterTrigger.click();
    await this.page.getByRole('option', { name: status }).click();
  }

  async switchToGridView() {
    await this.gridViewButton.click();
  }

  async switchToListView() {
    await this.listViewButton.click();
  }

  async getDeviceCount(): Promise<number> {
    return this.deviceCards.count();
  }

  async clickDevice(index: number = 0) {
    await this.deviceCards.nth(index).click();
  }
}
