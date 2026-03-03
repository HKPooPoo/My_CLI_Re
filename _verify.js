const fs = require('fs');
function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) keys.push(...flattenKeys(v, fullKey));
    else keys.push(fullKey);
  }
  return keys;
}
const files = ['en', 'zh-TW', 'default'];
const data = {};
for (const f of files) {
  try {
    data[f] = new Set(flattenKeys(JSON.parse(fs.readFileSync(`frontend/locales/${f}.json`, 'utf-8'))));
    console.log(`${f}.json: VALID (${data[f].size} keys)`);
  } catch(e) { console.log(`${f}.json: INVALID — ${e.message}`); process.exit(1); }
}
const all = new Set([...data.en, ...data['zh-TW'], ...data.default]);
let ok = true;
for (const k of [...all].sort()) {
  const missing = files.filter(f => !data[f].has(k));
  if (missing.length) { console.log(`MISMATCH: "${k}" missing in: ${missing.join(', ')}`); ok = false; }
}
if (ok) console.log('PARITY: All keys match.');
