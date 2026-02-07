import { Page, Locator, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly toaster: Locator;
  readonly connectionIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.getByRole('navigation');
    this.toaster = page.locator('[data-sonner-toaster]');
    this.connectionIndicator = page.locator('.h-2.w-2.border-2');
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
  }

  async expectToastMessage(message: string) {
    await expect(
      this.toaster.getByText(message, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  }

  async expectNoErrors() {
    const errors = this.page.locator('.text-destructive');
    await expect(errors).toHaveCount(0);
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to a dashboard section via sidebar link text
   */
  async navigateViaSidebar(linkText: string) {
    await this.sidebar.getByText(linkText).click();
  }
}
