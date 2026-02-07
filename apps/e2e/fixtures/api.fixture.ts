import { test as base, expect, APIRequestContext } from '@playwright/test';

type APIFixtures = {
  apiContext: APIRequestContext;
};

/**
 * Fixture that provides an APIRequestContext for direct API testing.
 */
export const test = base.extend<APIFixtures>({
  apiContext: async ({ playwright }, use) => {
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Accept: 'application/json',
      },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };
