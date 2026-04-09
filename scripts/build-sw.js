/**
 * Build Script — Generate sw.js from sw-src.js via Workbox injectManifest
 * Usage: node scripts/build-sw.js
 */
const { injectManifest } = require('workbox-build');

async function build() {
  const { count, size, warnings } = await injectManifest({
    swSrc: 'frontend/sw-src.js',
    swDest: 'frontend/sw.js',
    globDirectory: 'frontend/',
    globPatterns: [
      // Root
      'index.html',
      'style.css',
      'manifest.json',
      'images/favicon.ico',
      'images/banner.webp',

      // Locales (loaded at boot by i18n.js)
      'locales/*.json',

      // All stylesheets
      'stylesheets/*.css',

      // All core JS (modules + services + vendor)
      'javascript/**/*.js',

      // MOD loader entry point only (MOD folders cached by runtime SWR)
      'mods/mod-loader.js',

      // Audio
      'audio/*.mp3',
    ],
    globIgnores: [
      // Large WebGL2 lib — only used by ascii-animator MOD
      'javascript/vendor/textmode.js',
    ],
  });

  warnings.forEach(w => console.warn('\u26a0', w));
  console.log(`\u2713 Injected ${count} files (${(size / 1024).toFixed(1)} KB) into frontend/sw.js`);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
