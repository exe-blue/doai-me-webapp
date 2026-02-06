import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockClient = { from: vi.fn(), auth: {} };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient),
}));

async function importModule() {
  vi.resetModules();
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
  }));
  return await import('../supabase-server');
}

describe('dashboard supabase-server', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('createServerSupabaseClient()', () => {
    it('should throw when NEXT_PUBLIC_SUPABASE_URL is empty', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

      const { createServerSupabaseClient } = await importModule();

      expect(() => createServerSupabaseClient()).toThrow(
        'NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다'
      );
    });

    it('should throw when no API key is available', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { createServerSupabaseClient } = await importModule();

      expect(() => createServerSupabaseClient()).toThrow(
        'Supabase API 키가 설정되지 않았습니다'
      );
      consoleSpy.mockRestore();
    });

    it('should use service role key when available', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      const { createServerSupabaseClient } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      createServerSupabaseClient();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'service-role-key',
        expect.objectContaining({
          auth: { autoRefreshToken: false, persistSession: false },
        })
      );
    });

    it('should fall back to anon key when service role key is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { createServerSupabaseClient } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      createServerSupabaseClient();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY is missing')
      );
      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'anon-key',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getServerClient()', () => {
    it('should return singleton instance', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      const { getServerClient } = await importModule();
      const { createClient } = await import('@supabase/supabase-js');

      const first = getServerClient();
      const second = getServerClient();

      expect(first).toBe(second);
      expect(createClient).toHaveBeenCalledTimes(1);
    });
  });
});
