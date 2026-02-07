import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, 'playwright', '.auth', 'user.json');

setup('authenticate @smoke', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL || 'e2e-test@doai.me';
  const password = process.env.E2E_USER_PASSWORD || 'test-password-123!';

  await page.goto('/auth/signin');
  await expect(page.getByText('계정에 로그인하세요')).toBeVisible();

  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  await expect(page.getByText('대시보드')).toBeVisible();

  // Save auth state
  await page.context().storageState({ path: authFile });
});
