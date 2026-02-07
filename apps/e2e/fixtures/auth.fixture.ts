import { test as base, expect } from '@playwright/test';

/**
 * Fixture that provides an authenticated page.
 * Uses the storageState from auth.setup.ts project dependency.
 */
export const test = base.extend<{ authedPage: typeof base }>({});

export { expect };
