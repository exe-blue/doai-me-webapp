import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[E2E Setup] Missing Supabase credentials — skipping seed');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = process.env.E2E_USER_EMAIL || 'e2e-test@doai.me';
  const password = process.env.E2E_USER_PASSWORD || 'test-password-123!';

  // Ensure test user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const testUser = existingUsers?.users?.find((u) => u.email === email);

  if (!testUser) {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('[E2E Setup] Failed to create test user:', error.message);
    } else {
      console.log('[E2E Setup] Test user created:', email);
    }
  } else {
    console.log('[E2E Setup] Test user already exists:', email);
  }
}

export default globalSetup;
