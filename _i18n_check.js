const fs = require('fs');
const path = require('path');

// Flatten keys from JSON
function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Load all available keys from main + MOD locales (use en.json as reference)
const allKeys = new Set();

const mainEn = JSON.parse(fs.readFileSync('frontend/locales/en.json', 'utf-8'));
flattenKeys(mainEn).forEach(k => allKeys.add(k));

const modsDir = 'frontend/mods';
fs.readdirSync(modsDir).forEach(mod => {
  const enFile = path.join(modsDir, mod, 'locales', 'en.json');
  if (fs.existsSync(enFile)) {
    try {
      flattenKeys(JSON.parse(fs.readFileSync(enFile, 'utf-8'))).forEach(k => allKeys.add(k));
    } catch(e) {}
  }
});

console.log('Total available i18n keys: ' + allKeys.size);

// Scan JS files
function walkDir(dir) {
  const results = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'vendor') {
      results.push(...walkDir(full));
    } else if (e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const jsFiles = walkDir('frontend/javascript').concat(walkDir('frontend/mods'));

// Match t('key'), t("key"), t(`key`)
const tCallRegex = /\bt\(\s*['"`]([^'"`\$]+?)['"`]\s*[,)]/g;

const allTCalls = new Map();

for (const file of jsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  const regex = new RegExp(tCallRegex.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    if (!allTCalls.has(key)) allTCalls.set(key, []);
    allTCalls.get(key).push(path.relative('frontend', file));
  }
}

console.log('Total unique t() keys found in code: ' + allTCalls.size);
console.log('');

// === PART 1: Missing keys (t() calls referencing non-existent keys) ===
console.log('=== PART 1: t() keys missing from locale files ===');
let missingCount = 0;
for (const [key, files] of [...allTCalls.entries()].sort()) {
  if (!allKeys.has(key)) {
    console.log('  MISSING: "' + key + '"');
    console.log('    used in: ' + [...new Set(files)].join(', '));
    missingCount++;
  }
}
if (missingCount === 0) {
  console.log('  All t() keys found in locale files!');
}

// === PART 2: HTML data-i18n checks ===
console.log('');
console.log('=== PART 2: HTML data-i18n attribute checks ===');
const html = fs.readFileSync('frontend/index.html', 'utf-8');

const i18nRegex = /data-i18n="([^"]+)"/g;
const i18nPlaceholderRegex = /data-i18n-placeholder="([^"]+)"/g;

let htmlMissing = 0;
let match;
while ((match = i18nRegex.exec(html)) !== null) {
  if (!allKeys.has(match[1])) {
    console.log('  MISSING: data-i18n="' + match[1] + '"');
    htmlMissing++;
  }
}
while ((match = i18nPlaceholderRegex.exec(html)) !== null) {
  if (!allKeys.has(match[1])) {
    console.log('  MISSING: data-i18n-placeholder="' + match[1] + '"');
    htmlMissing++;
  }
}
if (htmlMissing === 0) {
  console.log('  All HTML i18n attributes reference valid keys!');
}

// === PART 3: Unused keys (in locale files but not referenced in code) ===
console.log('');
console.log('=== PART 3: Potentially unused keys in MAIN locale files ===');

const allRefs = new Set();

// From JS t() calls
for (const key of allTCalls.keys()) allRefs.add(key);

// From HTML
const htmlAllRegex = /data-i18n(?:-placeholder)?="([^"]+)"/g;
while ((match = htmlAllRegex.exec(html)) !== null) {
  allRefs.add(match[1]);
}

const mainKeys = new Set(flattenKeys(mainEn));
const unused = [];
for (const k of [...mainKeys].sort()) {
  if (!allRefs.has(k)) {
    unused.push(k);
  }
}

if (unused.length > 0) {
  console.log('  Potentially unused (' + unused.length + '):');
  for (const u of unused) console.log('    ' + u);
} else {
  console.log('  No unused keys found!');
}

// === PART 4: Interpolation variable parity ===
console.log('');
console.log('=== PART 4: Interpolation variable parity (main locales) ===');

const mainDefault = JSON.parse(fs.readFileSync('frontend/locales/default.json', 'utf-8'));
const mainZhTW = JSON.parse(fs.readFileSync('frontend/locales/zh-TW.json', 'utf-8'));

function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function extractPlaceholders(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\{(\w+)\}/g);
  return matches ? matches.sort() : [];
}

let interpIssues = 0;
for (const key of [...mainKeys].sort()) {
  const enVal = getNestedValue(mainEn, key);
  const defVal = getNestedValue(mainDefault, key);
  const zhVal = getNestedValue(mainZhTW, key);

  const enP = extractPlaceholders(enVal);
  const defP = extractPlaceholders(defVal);
  const zhP = extractPlaceholders(zhVal);

  if (enP.length > 0 || defP.length > 0 || zhP.length > 0) {
    const enS = enP.join(',');
    const defS = defP.join(',');
    const zhS = zhP.join(',');
    if (enS !== defS || enS !== zhS) {
      console.log('  MISMATCH: "' + key + '"');
      console.log('    en:      ' + (enS || '(none)'));
      console.log('    default: ' + (defS || '(none)'));
      console.log('    zh-TW:   ' + (zhS || '(none)'));
      interpIssues++;
    }
  }
}
if (interpIssues === 0) {
  console.log('  All interpolation variables match across locales!');
}

console.log('');
console.log('=== SUMMARY ===');
console.log('Total keys: ' + allKeys.size + ' (main: ' + mainKeys.size + ', MODs: ' + (allKeys.size - mainKeys.size) + ')');
console.log('t() references: ' + allTCalls.size + ' unique keys');
console.log('Missing from locales: ' + missingCount);
console.log('Missing HTML attrs: ' + htmlMissing);
console.log('Potentially unused: ' + unused.length);
console.log('Interpolation mismatches: ' + interpIssues);
