const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://zmvwwwrslkbcafyzfuhb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptdnd3d3JzbGtiY2FmeXpmdWhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyNjExMSwiZXhwIjoyMDg1MjAyMTExfQ.87WdRD7xw4Qs1VtLAF0QujDlDCWr1L0xE-zvZ_AS_yM'
);

async function getColumns(tableName) {
  // Try select with limit 1 to get column names from a real row
  const { data: row, error: err } = await c.from(tableName).select('*').limit(1);
  if (!err && row && row.length > 0) {
    return { table: tableName, columns: Object.keys(row[0]), source: 'row_keys' };
  }
  if (!err && row && row.length === 0) {
    // Table exists but is empty - try inserting a fake to see error
    return { table: tableName, columns: [], source: 'empty_table', note: 'Table exists but is empty' };
  }
  return { table: tableName, error: err?.message || err?.code || 'unknown', source: 'failed' };
}

const tables = [
  'jobs', 'job_assignments', 'devices', 'pcs', 'comments',
  'channels', 'videos', 'video_executions', 'nodes',
  'device_commands', 'scrcpy_commands', 'device_overview',
  'pc_summary', 'device_issues', 'system_logs', 'keywords',
  'schedules', 'device_onboarding_states'
];

async function main() {
  for (const t of tables) {
    const result = await getColumns(t);
    console.log(`\n=== ${result.table.toUpperCase()} ===`);
    if (result.error) {
      console.log(`  ERROR: ${result.error} (${result.source})`);
    } else if (result.columns && result.columns.length > 0) {
      console.log(`  COLUMNS: ${result.columns.join(', ')}`);
    } else {
      console.log(`  ${result.note || 'Empty table'}`);
    }
  }
}

main().catch(console.error);
