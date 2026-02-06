import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @supabase/supabase-js before importing module under test
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient),
}));

// Dynamic import to reset module state between tests
async function importModule() {
  // Clear module cache so singleton resets
  vi.resetModules();
  // Re-apply mock after resetModules
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
  }));
  return await import('../supabase');
}

describe('supabase client', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('getSupabase()', () => {
    it('should throw when SUPABASE_URL is not set', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;

      const { getSupabase } = await importModule();
      expect(() => getSupabase()).toThrow('Supabase credentials not configured');
    });

    it('should throw when service key is not set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;

      const { getSupabase } = await importModule();
      expect(() => getSupabase()).toThrow('Supabase credentials not configured');
    });

    it('should create client with SUPABASE_SERVICE_ROLE_KEY', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const { getSupabase } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      const client = getSupabase();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-service-role-key',
        expect.objectContaining({
          auth: { persistSession: false, autoRefreshToken: false },
          db: { schema: 'public' },
        })
      );
      expect(client).toBeDefined();
    });

    it('should fall back to SUPABASE_SERVICE_KEY when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

      const { getSupabase } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      getSupabase();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-service-key',
        expect.any(Object)
      );
    });

    it('should return singleton instance on repeated calls', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      const { getSupabase } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      const first = getSupabase();
      const second = getSupabase();

      expect(first).toBe(second);
      expect(createClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConnection()', () => {
    it('should return true when query succeeds', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [{ key: 'test' }], error: null }),
        }),
      });

      const { testConnection } = await importModule();
      const result = await testConnection();

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('settings');
    });

    it('should return false when query returns error', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection failed' } }),
        }),
      });

      const { testConnection } = await importModule();
      const result = await testConnection();

      expect(result).toBe(false);
    });

    it('should return false when getSupabase throws', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;

      const { testConnection } = await importModule();
      const result = await testConnection();

      expect(result).toBe(false);
    });
  });

  describe('closeSupabase()', () => {
    it('should reset singleton so next getSupabase creates new client', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      const { getSupabase, closeSupabase } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      getSupabase();
      expect(createClient).toHaveBeenCalledTimes(1);

      closeSupabase();
      getSupabase();
      expect(createClient).toHaveBeenCalledTimes(2);
    });
  });
});
