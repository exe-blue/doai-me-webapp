import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.po';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input#email');
    this.passwordInput = page.locator('input#password');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.border-destructive, .text-destructive').first();
    this.forgotPasswordLink = page.getByText('비밀번호를 잊으셨나요?');
    this.signUpLink = page.getByRole('link', { name: '회원가입' });
    this.pageTitle = page.getByText('계정에 로그인하세요');
  }

  async goto() {
    await this.page.goto('/auth/signin');
    await expect(this.pageTitle).toBeVisible();
  }

  async signIn(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectSignedIn() {
    await this.page.waitForURL('**/dashboard**', { timeout: 30_000 });
    await expect(this.page.getByText('대시보드')).toBeVisible();
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
  }

  async expectValidationError(message: string) {
    await expect(this.page.locator('.text-destructive').getByText(message)).toBeVisible();
  }
}
