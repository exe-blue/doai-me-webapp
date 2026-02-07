import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.po';

export class DashboardPage extends BasePage {
  readonly title: Locator;
  readonly operationRateCard: Locator;
  readonly totalDevicesCard: Locator;
  readonly onlineDevicesCard: Locator;
  readonly busyDevicesCard: Locator;
  readonly offlineDevicesCard: Locator;
  readonly systemStatusCard: Locator;
  readonly activeJobsSection: Locator;
  readonly quickLinkDevices: Locator;
  readonly quickLinkJobs: Locator;
  readonly quickLinkRegister: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByRole('heading', { name: '대시보드' });
    this.operationRateCard = page.getByText('가동률').locator('..');
    this.totalDevicesCard = page.getByText('총 기기').locator('..');
    this.onlineDevicesCard = page.getByText('작동중').locator('..');
    this.busyDevicesCard = page.getByText('작업중').locator('..');
    this.offlineDevicesCard = page.getByText('오프라인').locator('..');
    this.systemStatusCard = page.getByText('시스템 상태').locator('..');
    this.activeJobsSection = page.getByText('진행중인 작업').locator('..');
    this.quickLinkDevices = page.getByRole('link', { name: /기기관리/ });
    this.quickLinkJobs = page.getByRole('link', { name: /작업관리/ });
    this.quickLinkRegister = page.getByRole('link', { name: /작업등록/ });
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async expectLoaded() {
    await expect(this.title).toBeVisible();
  }

  async expectStatCardsVisible() {
    await expect(this.page.getByText('가동률')).toBeVisible();
    await expect(this.page.getByText('총 기기')).toBeVisible();
    await expect(this.page.getByText('작동중')).toBeVisible();
    await expect(this.page.getByText('작업중')).toBeVisible();
    await expect(this.page.getByText('오프라인')).toBeVisible();
  }

  async expectQuickLinksVisible() {
    await expect(this.quickLinkDevices).toBeVisible();
    await expect(this.quickLinkJobs).toBeVisible();
    await expect(this.quickLinkRegister).toBeVisible();
  }

  async clickQuickLink(name: '기기관리' | '작업관리' | '작업등록') {
    const link = this.page.getByRole('link', { name: new RegExp(name) });
    await link.click();
  }
}
