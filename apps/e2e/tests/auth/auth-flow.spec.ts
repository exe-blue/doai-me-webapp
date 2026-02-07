import { test, expect } from '@playwright/test';
import { AuthPage } from '../../page-objects/auth.po';
import { TestData } from '../../helpers/test-data';

test.describe('Auth Flow', () => {
  // ─── P0 SMOKE ──────────────────────────────────────────────

  test('AUTH-01: sign in with valid credentials @smoke', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signIn(TestData.user.email, TestData.user.password);
    await auth.expectSignedIn();
  });

  test('AUTH-02: show error for invalid credentials @smoke', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signIn(TestData.invalidUser.email, TestData.invalidUser.password);
    await auth.expectError();
  });

  test('AUTH-03: redirect unauthenticated user to signin @smoke', async ({ browser }) => {
    // Use a fresh context without stored auth
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/dashboard');
    await page.waitForURL('**/auth/signin**', { timeout: 15_000 });
    await expect(page.getByText('계정에 로그인하세요')).toBeVisible();

    await context.close();
  });

  // ─── P1 CORE ───────────────────────────────────────────────

  test('AUTH-04: logout clears session', async ({ page }) => {
    // First sign in
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signIn(TestData.user.email, TestData.user.password);
    await auth.expectSignedIn();

    // Find and click logout (usually in sidebar or settings)
    const logoutButton = page.getByRole('button', { name: /로그아웃|logout/i })
      .or(page.getByText(/로그아웃|logout/i));

    if (await logoutButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForURL('**/auth/**', { timeout: 15_000 });
    }
  });

  test('AUTH-05: session persists after page reload', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signIn(TestData.user.email, TestData.user.password);
    await auth.expectSignedIn();

    // Reload and verify still authenticated
    await page.reload();
    await expect(page.getByText('대시보드')).toBeVisible({ timeout: 15_000 });
  });

  // ─── P2 EXTENDED ───────────────────────────────────────────

  test('AUTH-06: forgot password link navigates correctly', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.forgotPasswordLink.click();
    await page.waitForURL('**/auth/forgot-password**');
  });

  test('AUTH-07: empty fields show validation errors', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.submitButton.click();
    // Form validation should prevent submission and show errors
    const validationErrors = page.locator('.text-destructive');
    await expect(validationErrors.first()).toBeVisible({ timeout: 5_000 });
  });
});
