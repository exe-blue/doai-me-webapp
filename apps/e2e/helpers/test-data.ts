export const TestData = {
  user: {
    email: process.env.E2E_USER_EMAIL || 'e2e-test@doai.me',
    password: process.env.E2E_USER_PASSWORD || 'test-password-123!',
  },

  invalidUser: {
    email: 'wrong@doai.me',
    password: 'wrong-password',
  },

  device: (i: number) => ({
    id: `device-${i}`,
    device_id: `S9-${String(i).padStart(3, '0')}`,
    serial_number: `E2E-SERIAL-${String(i).padStart(4, '0')}`,
    name: `E2E Device ${i}`,
    status: i <= 5 ? 'online' : i <= 7 ? 'busy' : i <= 8 ? 'error' : 'offline',
    battery_level: 50 + ((i * 5) % 50),
    cpu_usage: 20 + ((i * 3) % 60),
    memory_usage: 30 + ((i * 7) % 50),
    pc_id: `PC-${Math.ceil(i / 5)}`,
    last_heartbeat: new Date().toISOString(),
    ip_address: `192.168.1.${100 + i}`,
    os_version: 'Android 11',
    app_version: '2.1.0',
  }),

  devices: (count: number = 10) =>
    Array.from({ length: count }, (_, i) => TestData.device(i + 1)),

  job: {
    valid: {
      title: 'E2E Test Job',
      target_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      duration_sec: 30,
      prob_like: 50,
      prob_comment: 0,
      target_type: 'all_devices',
      target_value: 100,
      script_type: 'youtube_watch',
    },
    invalidUrl: {
      title: 'Invalid Job',
      target_url: 'https://example.com/not-youtube',
      video_url: 'https://example.com/not-youtube',
      duration_sec: 30,
    },
  },

  jobResponse: (overrides: Record<string, unknown> = {}) => ({
    id: 'job-1',
    title: 'E2E Test Job',
    display_name: '260207-TEST-N',
    target_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'active',
    is_active: true,
    type: 'VIDEO_URL',
    duration_sec: 30,
    prob_like: 50,
    prob_comment: 0,
    prob_playlist: 0,
    target_type: 'all_devices',
    target_value: 100,
    priority: false,
    total_assignments: 10,
    assigned_count: 10,
    completed_count: 0,
    failed_count: 0,
    created_at: new Date().toISOString(),
    stats: { pending: 10, running: 0, completed: 0, failed: 0, paused: 0, cancelled: 0 },
    comment_count: 0,
    ...overrides,
  }),

  deviceStats: {
    total: 10,
    online: 5,
    busy: 2,
    error: 1,
    offline: 2,
  },
};
