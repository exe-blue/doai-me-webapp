const fs = require('fs');
const os = require('os');
const path = require('path');

const candidates = [
  path.join(os.homedir(), '.config', 'supabase', 'access-token'),
  path.join(process.env.APPDATA || '', 'supabase', 'access-token'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase', 'access-token'),
  path.join(os.homedir(), '.supabase', 'access-token'),
];

for (const p of candidates) {
  try {
    const token = fs.readFileSync(p, 'utf8').trim();
    if (token) {
      console.log('FOUND at', p);
      console.log('TOKEN=' + token.substring(0, 15) + '...');
      process.exit(0);
    }
  } catch {}
}

// Check settings.json
const settingsCandidates = [
  path.join(process.env.APPDATA || '', 'supabase', 'settings.json'),
  path.join(os.homedir(), '.config', 'supabase', 'settings.json'),
];
for (const p of settingsCandidates) {
  try {
    const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
    const token = settings.access_token || settings.token || '';
    if (token) {
      console.log('FOUND in', p);
      console.log('TOKEN=' + token.substring(0, 15) + '...');
      process.exit(0);
    }
  } catch {}
}

// List dirs
const dirs = [
  path.join(process.env.APPDATA || '', 'supabase'),
  path.join(os.homedir(), '.config', 'supabase'),
];
for (const dir of dirs) {
  try {
    const files = fs.readdirSync(dir);
    console.log('Dir:', dir, '->', files);
  } catch {}
}
console.log('TOKEN NOT FOUND');
