const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Bundle plugin code (main.ts)
esbuild.buildSync({
  entryPoints: ['src/plugin/main.ts'],
  bundle: true,
  platform: 'browser', // Changed from 'node' to 'browser' for Figma compatibility
  outfile: 'dist/code.js',
  sourcemap: true,
  minify: true,
  target: ['es2017'], // Updated to support Object.entries() and Array.includes()
  format: 'iife', // Ensure it's wrapped in an IIFE for browser environment
});

// Bundle UI code (ui.js + ui.css)
esbuild.buildSync({
  entryPoints: ['src/ui/ui.js'],
  bundle: true,
  outfile: 'dist/ui.js',
  sourcemap: true,
  minify: true,
  loader: { '.css': 'css' },
  target: ['es2017'], // Updated to support newer JS features
  format: 'iife', // Ensure globals are available
  platform: 'browser', // For browser global scope
});

// Copy CSS and HTML to dist (for reference, but not used by Figma)
fs.copyFileSync('src/ui/ui.css', 'dist/ui.css');
fs.copyFileSync('src/ui/ui.html', 'dist/ui.html');

// Inline CSS and JS into HTML for Figma compatibility
function inlineCSSAndJSIntoHTML() {
  const cssContent = fs.readFileSync('dist/ui.css', 'utf8');
  const jsContent = fs.readFileSync('dist/ui.js', 'utf8');
  let htmlContent = fs.readFileSync('src/ui/ui.html', 'utf8');

  htmlContent = htmlContent.replace(
    /<link rel="stylesheet" href="ui.css">/,
    `<style>\n${cssContent}\n</style>`
  );
  htmlContent = htmlContent.replace(
    /<script src="ui.js"><\/script>/,
    `<script>\n${jsContent}\n</script>`
  );

  fs.writeFileSync('dist/ui.html', htmlContent);
  console.log('✅ Inlined CSS and JS into dist/ui.html for Figma compatibility');
}

inlineCSSAndJSIntoHTML(); 