import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const distDir = path.join(ROOT, 'dist');
const outDir = path.join(ROOT, 'dist-single');

const readText = async (p) => fs.readFile(p, 'utf8');

const listFiles = async (dir) => {
  const items = await fs.readdir(dir);
  return items.map((f) => path.join(dir, f));
};

const pickSingle = (files, ext) => {
  const matches = files.filter((f) => f.endsWith(ext));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 ${ext} file in dist/assets, got ${matches.length}`);
  }
  return matches[0];
};

const main = async () => {
  const htmlPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  const html = await readText(htmlPath);
  const assetFiles = await listFiles(assetsDir);

  const jsPath = pickSingle(assetFiles, '.js');
  const cssPath = pickSingle(assetFiles, '.css');

  const js = await readText(jsPath);
  const css = await readText(cssPath);

  // Avoid accidentally closing the surrounding tags when inlining.
  // Use function-based replacements so `$` sequences in bundles are not interpreted by String.replace.
  const safeJs = js.replaceAll('</script>', '<\\/script>');
  const safeCss = css.replaceAll('</style>', '<\\/style>');

  let out = html;

  // Remove modulepreload tags (single file shouldn't reference external assets)
  out = out.replace(/\s*<link rel="modulepreload"[^>]*>\s*/g, '\n');

  // Inline CSS
  out = out.replace(
    /<link\s+rel="stylesheet"[^>]*href="\.\/assets\/[^\"]+\.css"[^>]*>/,
    () => `<style>\n${safeCss}\n</style>`
  );

  // Inline main JS (keep it as module)
  out = out.replace(
    /<script\s+type="module"[^>]*src="\.\/assets\/[^\"]+\.js"[^>]*><\/script>/,
    () => `<script type="module">\n${safeJs}\n</script>`
  );

  // Sanity check: no remaining dist/assets references
  if (/\.\/assets\//.test(out)) {
    throw new Error('Singlefile output still references ./assets/.');
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), out, 'utf8');

  console.log(`Singlefile build written to ${path.relative(ROOT, path.join(outDir, 'index.html'))}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
