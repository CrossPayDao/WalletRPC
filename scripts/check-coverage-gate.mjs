import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const summaryPath = path.join(root, 'coverage', 'coverage-summary.json');
const baselinePath = path.join(root, '.ci', 'coverage-baseline.json');

const requiredMetrics = ['lines', 'statements', 'functions', 'branches'];

function fail(message) {
  console.error(`[coverage-gate] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(summaryPath)) {
  fail(`coverage summary not found at ${summaryPath}. Run "npm run test:coverage" first.`);
}

if (!fs.existsSync(baselinePath)) {
  fail(`baseline file not found at ${baselinePath}.`);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const total = summary.total || {};
const minimum = baseline.minimum || {};
const previous = baseline.previous || {};

const errors = [];

for (const metric of requiredMetrics) {
  const current = Number(total[metric]?.pct ?? NaN);
  const min = Number(minimum[metric] ?? NaN);
  const prev = Number(previous[metric] ?? NaN);

  if (!Number.isFinite(current)) {
    errors.push(`${metric}: current coverage is invalid`);
    continue;
  }
  if (!Number.isFinite(min) || !Number.isFinite(prev)) {
    errors.push(`${metric}: baseline values are invalid`);
    continue;
  }

  if (current < min) {
    errors.push(`${metric}: ${current.toFixed(2)}% < minimum ${min.toFixed(2)}%`);
  }

  if (current < prev) {
    errors.push(`${metric}: ${current.toFixed(2)}% < previous ${prev.toFixed(2)}%`);
  }
}

if (errors.length > 0) {
  console.error('[coverage-gate] FAILED');
  for (const item of errors) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('[coverage-gate] PASSED');
for (const metric of requiredMetrics) {
  const current = Number(total[metric].pct);
  const min = Number(minimum[metric]);
  const prev = Number(previous[metric]);
  console.log(
    `- ${metric}: current=${current.toFixed(2)}% minimum=${min.toFixed(2)}% previous=${prev.toFixed(2)}%`
  );
}
