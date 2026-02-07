import { Page } from '@playwright/test';
import { TestData } from './test-data';

/**
 * Mock the devices API response
 */
export async function mockDevicesAPI(
  page: Page,
  devices?: ReturnType<typeof TestData.devices>,
) {
  const data = devices || TestData.devices(10);
  const pcs = [...new Set(data.map((d) => d.pc_id))].map((pcId) => ({
    pc_id: pcId,
    device_count: data.filter((d) => d.pc_id === pcId).length,
    online_count: data.filter((d) => d.pc_id === pcId && d.status !== 'offline').length,
  }));

  const stats = {
    total: data.length,
    online: data.filter((d) => d.status === 'online').length,
    busy: data.filter((d) => d.status === 'busy').length,
    error: data.filter((d) => d.status === 'error').length,
    offline: data.filter((d) => d.status === 'offline').length,
  };

  await page.route('**/api/devices**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices: data, pcs, stats }),
      });
    }
    return route.continue();
  });
}

/**
 * Mock the jobs API response
 */
export async function mockJobsAPI(
  page: Page,
  jobs?: ReturnType<typeof TestData.jobResponse>[],
) {
  const data = jobs || [TestData.jobResponse()];

  await page.route('**/api/jobs', (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: data, total: data.length, limit: 50, offset: 0 }),
      });
    }

    if (method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: TestData.jobResponse({ id: `job-new-${Date.now()}` }),
          assignments: [],
          stats: { total_devices: 10, assigned_devices: 10, comments_count: 0 },
        }),
      });
    }

    return route.continue();
  });

  // Mock individual job routes
  await page.route('**/api/jobs/*', (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data[0] || TestData.jobResponse()),
      });
    }

    if (method === 'DELETE') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }

    if (method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, job: data[0] }),
      });
    }

    return route.continue();
  });
}

/**
 * Mock the dashboard home API (devices overview for socket context)
 */
export async function mockDashboardAPIs(page: Page) {
  await mockDevicesAPI(page);
  await mockJobsAPI(page);

  // Mock any additional dashboard endpoints
  await page.route('**/api/devices/overview**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stats: TestData.deviceStats }),
    }),
  );
}

/**
 * Mock API to return error response
 */
export async function mockAPIError(
  page: Page,
  urlPattern: string,
  statusCode: number = 500,
  message: string = 'Internal Server Error',
) {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    }),
  );
}

/**
 * Mock executions/history API
 */
export async function mockExecutionsAPI(page: Page) {
  await page.route('**/api/executions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        executions: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    }),
  );
}
