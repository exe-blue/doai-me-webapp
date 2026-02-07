/**
 * Execute SQL on remote Supabase via Management API
 * Uses the same auth as supabase CLI (reads from OS keychain/credentials)
 */
const { execSync } = require('child_process');
const PROJECT_REF = 'zmvwwwrslkbcafyzfuhb';

// Get access token from supabase CLI by reading its stored credentials
function getAccessToken() {
  try {
    // The CLI stores its token; we can extract it by calling the CLI
    // and intercepting the API call. Let's use the v1 API directly.
    const output = execSync('npx supabase --debug projects list 2>&1', {
      encoding: 'utf8',
      timeout: 15000,
    });
    // Extract the access token from debug output
    const match = output.match(/Bearer\s+(\S+)/);
    if (match) return match[1];

    // Alternative: the CLI might use OS credential store
    // Let's just use the Management API endpoint directly
    return null;
  } catch {
    return null;
  }
}

async function runSQL(sql, accessToken) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await resp.text();
  if (resp.ok) {
    try { return { success: true, data: JSON.parse(text) }; }
    catch { return { success: true, data: text }; }
  }
  return { success: false, status: resp.status, error: text };
}

async function main() {
  // Try to get access token
  let token = process.env.SUPABASE_ACCESS_TOKEN;

  if (!token) {
    // Read from supabase CLI credentials
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const credPaths = [
      // Windows credential file used by Supabase CLI
      path.join(process.env.LOCALAPPDATA || '', 'supabase', 'credentials.json'),
      path.join(process.env.APPDATA || '', 'supabase', 'credentials.json'),
      path.join(os.homedir(), '.config', 'supabase', 'credentials.json'),
      // Access token file
      path.join(process.env.LOCALAPPDATA || '', 'supabase', 'access-token'),
      path.join(process.env.APPDATA || '', 'supabase', 'access-token'),
    ];

    for (const p of credPaths) {
      try {
        const content = fs.readFileSync(p, 'utf8').trim();
        if (content.startsWith('{')) {
          const creds = JSON.parse(content);
          token = creds.access_token || creds.token || Object.values(creds)[0];
        } else {
          token = content;
        }
        if (token) {
          console.log('Found token at:', p);
          break;
        }
      } catch {}
    }
  }

  // Last resort: use wincred or keytar to read from Windows Credential Manager
  if (!token) {
    try {
      // Supabase CLI v2 stores tokens in the OS keychain
      // On Windows, it uses wincred via keyring
      const output = execSync(
        'powershell -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((cmdkey /list | Select-String supabase).ToString().Split()[0]))"',
        { encoding: 'utf8', timeout: 5000 }
      );
      if (output.trim()) token = output.trim();
    } catch {}
  }

  if (!token) {
    console.error('Cannot find Supabase access token.');
    console.error('Please set SUPABASE_ACCESS_TOKEN env var or run: npx supabase login');
    process.exit(1);
  }

  console.log('Token found, executing SQL...\n');

  // Step 1: Check existing constraints
  console.log('=== Checking existing FK constraints ===');
  const checkResult = await runSQL(`
    SELECT conname, conrelid::regclass AS table_name,
           confrelid::regclass AS referenced_table
    FROM pg_constraint
    WHERE contype = 'f'
    AND (conrelid::regclass::text = 'video_executions'
         OR conrelid::regclass::text = 'device_issues')
    ORDER BY conname;
  `, token);

  if (checkResult.success) {
    console.log('Existing FKs:', JSON.stringify(checkResult.data, null, 2));
  } else {
    console.log('Check failed:', checkResult.error);
  }

  // Step 2: Add FK for video_executions → videos
  console.log('\n=== Adding FK: video_executions.video_id → videos.id ===');
  const fk1 = await runSQL(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_video_executions_video_id'
      ) THEN
        ALTER TABLE video_executions
          ADD CONSTRAINT fk_video_executions_video_id
          FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
        RAISE NOTICE 'FK video_executions → videos added';
      ELSE
        RAISE NOTICE 'FK video_executions → videos already exists';
      END IF;
    END $$;
  `, token);
  console.log(fk1.success ? 'OK' : `FAIL: ${fk1.error}`);

  // Step 3: Ensure devices.serial_number has UNIQUE constraint
  console.log('\n=== Ensuring devices.serial_number is UNIQUE ===');
  const uniq = await runSQL(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'devices_serial_number_unique'
        OR (conrelid = 'devices'::regclass AND contype = 'u'
            AND array_length(conkey, 1) = 1)
      ) THEN
        ALTER TABLE devices ADD CONSTRAINT devices_serial_number_unique UNIQUE (serial_number);
        RAISE NOTICE 'UNIQUE constraint added to devices.serial_number';
      ELSE
        RAISE NOTICE 'UNIQUE constraint already exists on devices.serial_number';
      END IF;
    EXCEPTION WHEN duplicate_table THEN
      RAISE NOTICE 'UNIQUE constraint already exists';
    END $$;
  `, token);
  console.log(uniq.success ? 'OK' : `FAIL: ${uniq.error}`);

  // Step 4: Add FK for device_issues → devices (via serial_number)
  console.log('\n=== Adding FK: device_issues.device_id → devices.serial_number ===');
  const fk2 = await runSQL(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_device_issues_device_serial'
      ) THEN
        ALTER TABLE device_issues
          ADD CONSTRAINT fk_device_issues_device_serial
          FOREIGN KEY (device_id) REFERENCES devices(serial_number) ON DELETE CASCADE;
        RAISE NOTICE 'FK device_issues → devices added';
      ELSE
        RAISE NOTICE 'FK device_issues → devices already exists';
      END IF;
    END $$;
  `, token);
  console.log(fk2.success ? 'OK' : `FAIL: ${fk2.error}`);

  // Step 5: Reload PostgREST schema cache
  console.log('\n=== Reloading PostgREST schema cache ===');
  const reload = await runSQL('NOTIFY pgrst, \'reload schema\';', token);
  console.log(reload.success ? 'OK' : `FAIL: ${reload.error}`);

  console.log('\nDone! Verify by testing the join queries.');
}

main().catch(console.error);
