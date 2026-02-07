/**
 * Run SQL Migration on Supabase
 * Usage: node run-migration.js <migration-file>
 */

require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration(migrationFile) {
  const filePath = path.resolve(migrationFile);

  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf-8');
  console.log(`\n📄 Running migration: ${path.basename(filePath)}`);
  console.log('━'.repeat(60));

  // Split by semicolons but be careful with function bodies
  // We'll execute statements one by one for better error handling
  const statements = splitStatements(sql);

  console.log(`\n📊 Found ${statements.length} statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt || stmt.startsWith('--')) continue;

    const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });

      if (error) {
        // Try direct execution via REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ sql: stmt })
        });

        if (!response.ok) {
          throw new Error(error?.message || 'Unknown error');
        }
      }

      console.log('✅');
      successCount++;
    } catch (err) {
      // Many statements will "fail" with "already exists" which is fine
      const msg = err.message || 'Unknown error';
      if (msg.includes('already exists') || msg.includes('does not exist')) {
        console.log('⚠️ (already exists/not needed)');
        successCount++;
      } else {
        console.log(`❌ ${msg.substring(0, 50)}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`\n✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('\nMigration complete!\n');
}

/**
 * Split SQL into statements, handling function bodies correctly
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inFunction = false;
  let dollarQuoteTag = null;

  const lines = sql.split('\n');

  for (const line of lines) {
    current += line + '\n';

    // Detect start of function body ($$)
    const dollarMatch = line.match(/\$([a-zA-Z_]*)\$/);
    if (dollarMatch) {
      if (dollarQuoteTag === null) {
        dollarQuoteTag = dollarMatch[0];
        inFunction = true;
      } else if (dollarMatch[0] === dollarQuoteTag) {
        dollarQuoteTag = null;
        inFunction = false;
      }
    }

    // If not in function and line ends with semicolon, it's end of statement
    if (!inFunction && line.trim().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter(s => s && !s.match(/^--.*$/));
}

// Run
const migrationFile = process.argv[2] || '../migrations/003_channel_comment_system.sql';
runMigration(migrationFile);
