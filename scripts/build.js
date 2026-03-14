#!/usr/bin/env node
/**
 * Production build script.
 *
 * Reads timetable.html, concatenates all local JS and CSS files in
 * their original order, minifies them with esbuild, and writes a
 * self-contained dist/ folder ready for deployment.
 *
 * Usage:  node scripts/build.js
 */

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const SRC_HTML = path.join(ROOT, "timetable.html");
const DIST = path.join(ROOT, "dist");

/* ── helpers ─────────────────────────────────────────────────────── */

/** Extract attribute values from tags matching a regex pattern */
function extractPaths(html, regex) {
  const paths = [];
  let m;
  while ((m = regex.exec(html)) !== null) paths.push(m[1]);
  return paths;
}

/** Read and concatenate files, separated by newlines */
function concat(filePaths) {
  return filePaths
    .map((p) => {
      const full = path.join(ROOT, p);
      if (!fs.existsSync(full)) {
        console.warn(`  ⚠ skipping missing file: ${p}`);
        return "";
      }
      return fs.readFileSync(full, "utf8");
    })
    .join("\n");
}

/* ── main ────────────────────────────────────────────────────────── */

async function build() {
  const startTime = Date.now();
  console.log("🔨 Building production bundle…\n");

  const html = fs.readFileSync(SRC_HTML, "utf8");

  // ── 1. Collect local script paths (skip CDN scripts) ──────────
  const scriptRe = /<script\s+src="(src\/[^"]+)"><\/script>/g;
  const jsPaths = extractPaths(html, scriptRe);
  console.log(`  📦 ${jsPaths.length} JS files found`);

  // ── 2. Collect local CSS paths (skip Google Fonts) ────────────
  const cssRe = /<link\s+rel="stylesheet"\s+href="(src\/[^"]+)"\s*\/?>/g;
  const cssPaths = extractPaths(html, cssRe);
  console.log(`  🎨 ${cssPaths.length} CSS files found`);

  // ── 3. Concatenate ────────────────────────────────────────────
  const jsBundle = concat(jsPaths);
  const cssBundle = concat(cssPaths);

  // ── 4. Minify with esbuild ────────────────────────────────────
  const [jsResult, cssResult] = await Promise.all([
    esbuild.transform(jsBundle, {
      loader: "js",
      minify: true,
      target: "es2020",
    }),
    esbuild.transform(cssBundle, {
      loader: "css",
      minify: true,
      target: "es2020",
    }),
  ]);

  // ── 5. Prepare dist/ ─────────────────────────────────────────
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });

  fs.writeFileSync(path.join(DIST, "bundle.min.js"), jsResult.code);
  fs.writeFileSync(path.join(DIST, "bundle.min.css"), cssResult.code);

  // ── 6. Generate production HTML ───────────────────────────────
  let prodHtml = html;

  // Replace local CSS links with single bundle
  const firstCssTag = /<link\s+rel="stylesheet"\s+href="src\/[^"]+"\s*\/?>/;
  const allCssTag = /<link\s+rel="stylesheet"\s+href="src\/[^"]+"\s*\/?>\n?/g;
  prodHtml = prodHtml.replace(firstCssTag, '<link rel="stylesheet" href="bundle.min.css" />');
  prodHtml = prodHtml.replace(allCssTag, "");
  // The first one was already replaced, remaining are removed

  // Replace local script tags with single bundle
  const firstScriptTag = /<script\s+src="src\/[^"]+"><\/script>/;
  const allScriptTag = /<script\s+src="src\/[^"]+"><\/script>\n?/g;
  prodHtml = prodHtml.replace(firstScriptTag, '<script src="bundle.min.js"><\/script>');
  prodHtml = prodHtml.replace(allScriptTag, "");

  // Remove empty comment-only lines left behind (e.g. <!-- Core modules -->)
  prodHtml = prodHtml.replace(/^\s*<!--\s*(Core|Versioning|UI|Export|PDF|Scheduler)\s.*-->\s*\n/gm, "");

  // Clean up excessive blank lines (3+ → 2)
  prodHtml = prodHtml.replace(/\n{3,}/g, "\n\n");

  fs.writeFileSync(path.join(DIST, "index.html"), prodHtml);

  // ── 7. Copy static assets ────────────────────────────────────
  const favicon = path.join(ROOT, "favicon.svg");
  if (fs.existsSync(favicon)) {
    fs.copyFileSync(favicon, path.join(DIST, "favicon.svg"));
  }

  // ── 8. Report ────────────────────────────────────────────────
  const jsSize = (jsResult.code.length / 1024).toFixed(1);
  const cssSize = (cssResult.code.length / 1024).toFixed(1);
  const elapsed = Date.now() - startTime;

  console.log(`\n  ✅ dist/bundle.min.js   ${jsSize} KB`);
  console.log(`  ✅ dist/bundle.min.css  ${cssSize} KB`);
  console.log(`  ✅ dist/index.html      ready`);
  console.log(`\n  ⏱  Done in ${elapsed}ms`);
  console.log(`  📁 Output: ${DIST}/`);
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
