async function globalTeardown() {
  // Clean-up runs after all tests complete.
  // Currently a no-op — test data is re-seeded on next run.
  // Add DB cleanup here if needed.
  console.log('[E2E Teardown] Complete');
}

export default globalTeardown;
