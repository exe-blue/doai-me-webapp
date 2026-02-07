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

async function query(sql) {
  // Use the Supabase Management API via the project's DB connection
  // POST to /rest/v1/rpc/exec_sql won't work unless we create that function
  // Instead, use pg_net extension or direct DB pooler connection

  // Try using the Supabase pooler connection string
  const dbUrl = `postgresql://postgres.zmvwwwrslkbcafyzfuhb:${process.env.DB_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

  // Since we might not have pg client, let's use the Management API
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ sql }),
  });

  if (resp.ok) {
    return { success: true, data: await resp.json() };
  }
  return { success: false, error: await resp.text(), status: resp.status };
}

async function main() {
  console.log('=== Step 1: Create exec_sql function ===');

  // First, try to create the exec_sql helper function via a different approach
  // We'll use the Supabase client to create it
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: 'public' },
  });

  // Check current constraints first
  console.log('\n=== Checking existing constraints ===');
  const { data: constraints, error: cErr } = await supabase
    .from('information_schema.table_constraints' in {} ? 'table_constraints' : 'pg_catalog.pg_constraint')
    .select('*');

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

    // exec_sql exists, run migrations
    if (e1) {
      console.log('\nAdding FK: video_executions.video_id → videos.id');
      const { error } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE video_executions ADD CONSTRAINT fk_video_executions_video_id FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;`
      });
      console.log(error ? `FAIL: ${error.message}` : 'OK');
    }

    if (e2) {
      console.log('\nAdding FK: device_issues.device_id → devices.serial_number');
      const { error } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE device_issues ADD CONSTRAINT fk_device_issues_device_serial FOREIGN KEY (device_id) REFERENCES devices(serial_number) ON DELETE CASCADE;`
      });
      console.log(error ? `FAIL: ${error.message}` : 'OK');
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
