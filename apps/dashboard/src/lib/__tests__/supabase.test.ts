import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @supabase/supabase-js
const mockClient = { from: vi.fn(), auth: {} };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient),
}));

async function importModule() {
  vi.resetModules();
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
  }));
  return await import('../supabase');
}

describe('dashboard supabase client', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should throw when NEXT_PUBLIC_SUPABASE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await expect(importModule()).rejects.toThrow('Supabase 환경 변수가 설정되지 않았습니다');
  });

  it('should throw when NEXT_PUBLIC_SUPABASE_ANON_KEY is not set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await expect(importModule()).rejects.toThrow('Supabase 환경 변수가 설정되지 않았습니다');
  });

  it('should create client with correct URL and anon key', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    const mod = await importModule();
    const { createClient } = await import('@supabase/supabase-js');

    expect(mod.supabase).toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key'
    );
  });

  it('should export the supabase client as a named export', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    const mod = await importModule();

    expect(mod.supabase).toBe(mockClient);
  });
});
