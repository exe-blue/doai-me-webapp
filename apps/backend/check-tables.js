/**
 * Check if required tables exist in Supabase
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('\n📊 Checking Supabase Tables...\n');
  console.log('━'.repeat(50));

  const tables = [
    'devices',
    'jobs',
    'job_assignments',
    'channels',
    'comments',
    'channel_check_logs'
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: NOT FOUND (${error.message})`);
      } else {
        console.log(`✅ ${table}: EXISTS (${count} rows)`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ERROR (${err.message})`);
    }
  }

  console.log('\n' + '━'.repeat(50));

  // Check specific columns
  console.log('\n📋 Checking New Columns...\n');

  // Check jobs.type column
  const { data: jobSample } = await supabase
    .from('jobs')
    .select('type, priority, display_name')
    .limit(1);

  if (jobSample) {
    const hasType = jobSample[0]?.hasOwnProperty('type') ?? false;
    const hasPriority = jobSample[0]?.hasOwnProperty('priority') ?? false;
    const hasDisplayName = jobSample[0]?.hasOwnProperty('display_name') ?? false;
    console.log(`jobs.type: ${hasType ? '✅' : '❌'}`);
    console.log(`jobs.priority: ${hasPriority ? '✅' : '❌'}`);
    console.log(`jobs.display_name: ${hasDisplayName ? '✅' : '❌'}`);
  }

  // Check devices.ip_address column
  const { data: deviceSample } = await supabase
    .from('devices')
    .select('ip_address, connection_info')
    .limit(1);

  if (deviceSample !== null) {
    const sample = deviceSample[0] || {};
    const hasIp = sample.hasOwnProperty('ip_address');
    const hasConnInfo = sample.hasOwnProperty('connection_info');
    console.log(`devices.ip_address: ${hasIp ? '✅' : '❌'}`);
    console.log(`devices.connection_info: ${hasConnInfo ? '✅' : '❌'}`);
  }

  console.log('\n━'.repeat(50));
  console.log('\n📝 If tables/columns are missing, run the migration:');
  console.log('   1. Go to Supabase Dashboard -> SQL Editor');
  console.log('   2. Copy & paste: migrations/003_channel_comment_system.sql');
  console.log('   3. Run the migration\n');
}

checkTables();
