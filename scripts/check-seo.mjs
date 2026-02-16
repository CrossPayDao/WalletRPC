import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const mustExist = (filePath) => {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${path.relative(root, filePath)}`);
    return false;
  }
  return true;
};

const read = (filePath) => fs.readFileSync(filePath, 'utf8');

const assertIncludes = (text, expected, sourceName) => {
  if (!text.includes(expected)) {
    failures.push(`${sourceName} missing: ${expected}`);
  }
};

const assertNotIncludes = (text, forbidden, sourceName) => {
  if (text.includes(forbidden)) {
    failures.push(`${sourceName} contains forbidden text: ${forbidden}`);
  }
};

const assertRegex = (text, pattern, sourceName, desc) => {
  if (!pattern.test(text)) {
    failures.push(`${sourceName} missing pattern (${desc}): ${pattern}`);
  }
};

const publicDir = path.join(root, 'public');
const robotsPath = path.join(publicDir, 'robots.txt');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const securityPath = path.join(publicDir, 'security.txt');
const indexPath = path.join(root, 'index.html');
const metadataPath = path.join(root, 'metadata.json');
const zhLandingPath = path.join(publicDir, 'zh', 'index.html');
const enLandingPath = path.join(publicDir, 'en', 'index.html');

if (mustExist(robotsPath)) {
  const robots = read(robotsPath);
  ['Disallow: /docs/', 'Disallow: /internal/', 'Disallow: /preview/'].forEach((rule) => {
    assertIncludes(robots, rule, 'public/robots.txt');
  });
}

if (mustExist(sitemapPath)) {
  const sitemap = read(sitemapPath);
  ['/docs/', '/internal/', '/preview/'].forEach((forbidden) => {
    assertNotIncludes(sitemap, forbidden, 'public/sitemap.xml');
  });
  assertRegex(sitemap, /<loc>https:\/\/[^<]+<\/loc>/, 'public/sitemap.xml', 'absolute URL loc');
  assertIncludes(sitemap, 'xmlns:xhtml="http://www.w3.org/1999/xhtml"', 'public/sitemap.xml');
  assertIncludes(sitemap, '<loc>https://wallet-rpc.cp.cash/zh/</loc>', 'public/sitemap.xml');
  assertIncludes(sitemap, '<loc>https://wallet-rpc.cp.cash/en/</loc>', 'public/sitemap.xml');
  assertIncludes(sitemap, 'hreflang="zh-CN"', 'public/sitemap.xml');
  assertIncludes(sitemap, 'hreflang="en"', 'public/sitemap.xml');
  assertIncludes(sitemap, 'hreflang="x-default"', 'public/sitemap.xml');
}

if (mustExist(securityPath)) {
  const security = read(securityPath);
  assertIncludes(security, 'Contact:', 'public/security.txt');
  assertIncludes(security, 'Policy:', 'public/security.txt');
}

if (mustExist(indexPath)) {
  const indexHtml = read(indexPath);

  [
    '<meta name="robots"',
    '<link rel="canonical"',
    'hreflang="zh-CN"',
    'hreflang="en"',
    'hreflang="x-default"',
    'property="og:title"',
    'property="og:description"',
    'property="og:url"',
    'property="og:locale"',
    'property="og:locale:alternate"',
    'name="twitter:card"',
    'name="twitter:title"',
    'name="twitter:description"',
    'type="application/ld+json"'
  ].forEach((marker) => assertIncludes(indexHtml, marker, 'index.html'));

  assertIncludes(indexHtml, 'href="https://wallet-rpc.cp.cash/"', 'index.html');
  assertIncludes(indexHtml, 'property="og:url" content="https://wallet-rpc.cp.cash/"', 'index.html');
  assertIncludes(indexHtml, 'hreflang="zh-CN" href="https://wallet-rpc.cp.cash/zh/"', 'index.html');
  assertIncludes(indexHtml, 'hreflang="en" href="https://wallet-rpc.cp.cash/en/"', 'index.html');

  ['high-performance', 'lightning-fast'].forEach((forbidden) => {
    assertNotIncludes(indexHtml.toLowerCase(), forbidden, 'index.html');
  });

  ['zero-telemetry', 'no-backend', 'safe multisig', 'custom rpc'].forEach((requiredTerm) => {
    assertIncludes(indexHtml.toLowerCase(), requiredTerm, 'index.html');
  });
}

if (mustExist(zhLandingPath)) {
  const zhLandingHtml = read(zhLandingPath);
  [
    '<link rel="canonical" href="https://wallet-rpc.cp.cash/zh/"',
    'hreflang="zh-CN" href="https://wallet-rpc.cp.cash/zh/"',
    'hreflang="en" href="https://wallet-rpc.cp.cash/en/"',
    'hreflang="x-default" href="https://wallet-rpc.cp.cash/"'
  ].forEach((marker) => assertIncludes(zhLandingHtml, marker, 'public/zh/index.html'));
}

if (mustExist(enLandingPath)) {
  const enLandingHtml = read(enLandingPath);
  [
    '<link rel="canonical" href="https://wallet-rpc.cp.cash/en/"',
    'hreflang="zh-CN" href="https://wallet-rpc.cp.cash/zh/"',
    'hreflang="en" href="https://wallet-rpc.cp.cash/en/"',
    'hreflang="x-default" href="https://wallet-rpc.cp.cash/"'
  ].forEach((marker) => assertIncludes(enLandingHtml, marker, 'public/en/index.html'));
}

if (mustExist(metadataPath)) {
  const metadataRaw = read(metadataPath);
  assertNotIncludes(metadataRaw.toLowerCase(), 'high-performance', 'metadata.json');
  assertRegex(
    metadataRaw.toLowerCase(),
    /(privacy-first|zero telemetry|zero-telemetry|no backend|no-backend)/,
    'metadata.json',
    'privacy-first narrative'
  );
}

const distIndexPath = path.join(root, 'dist', 'index.html');
const distDocsPath = path.join(root, 'dist', 'docs');
if (fs.existsSync(distIndexPath)) {
  const distHtml = read(distIndexPath);
  ['/docs/', '/internal/', '/preview/'].forEach((forbidden) => {
    assertNotIncludes(distHtml, forbidden, 'dist/index.html');
  });
}
if (fs.existsSync(distDocsPath)) {
  failures.push('dist output must not contain docs/ directory');
}

if (failures.length > 0) {
  console.error('SEO gate failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('SEO gate passed.');
