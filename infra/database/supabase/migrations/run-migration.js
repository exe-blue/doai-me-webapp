/**
 * Execute FK migration via Supabase service role + pg_net/exec_sql RPC
 * Since Supabase REST doesn't expose raw SQL, we use a workaround:
 * Create a temporary function, execute it, then drop it.
 */
const SUPABASE_URL = 'https://zmvwwwrslkbcafyzfuhb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}


async function main() {
  console.log('=== Step 1: Create exec_sql function ===');

  // First, try to create the exec_sql helper function via a different approach
  // We'll use the Supabase client to create it
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: 'public' },
  });

  // Direct approach: try the FK join and see what happens
  console.log('\n=== Testing video_executions → videos FK ===');
  const { data: t1, error: e1 } = await supabase
    .from('video_executions')
    .select('video_id, videos(title)')
    .limit(1);
  console.log('Result:', e1 ? `FAIL: ${e1.message}` : 'OK - FK exists');

  console.log('\n=== Testing device_issues → devices FK ===');
  const { data: t2, error: e2 } = await supabase
    .from('device_issues')
    .select('device_id, devices(id, name)')
    .limit(1);
  console.log('Result:', e2 ? `FAIL: ${e2.message}` : 'OK - FK exists');

  // If FKs don't exist, we need psql or dashboard access
  if (e1 || e2) {
    console.log('\n=== FK missing. Attempting to add via SQL... ===');

    // Try using rpc to check if exec_sql exists
    const { error: rpcErr } = await supabase.rpc('exec_sql', {
      sql: 'SELECT 1'
    });

    if (rpcErr && rpcErr.message.includes('Could not find the function')) {
      console.log('\nexec_sql function does not exist.');
      console.log('Creating it requires dashboard access or psql.');
      console.log('\nPlease run this SQL in Supabase Dashboard SQL Editor:');
      console.log('---');
      console.log(`
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
      `);
      console.log('---');
      console.log('Then re-run this script.');
      process.exit(1);
    }

    // exec_sql exists, run migrations atomically
    const statements = [];
    if (e1) {
      statements.push(`ALTER TABLE video_executions ADD CONSTRAINT fk_video_executions_video_id FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;`);
    }
    if (e2) {
      statements.push(`ALTER TABLE device_issues ADD CONSTRAINT fk_device_issues_device_serial FOREIGN KEY (device_id) REFERENCES devices(serial_number) ON DELETE CASCADE;`);
    }

    if (statements.length > 0) {
      const sql = `BEGIN; ${statements.join(' ')} COMMIT;`;
      console.log('\nExecuting migration transaction...');
      const { error } = await supabase.rpc('exec_sql', { sql });
      if (error) {
        console.error(`Migration FAILED: ${error.message}`);
        process.exit(1);
      }
      console.log('Migration completed successfully.');
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
