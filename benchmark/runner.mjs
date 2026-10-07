// Isolated code executor — receives JSON via stdin, writes JSON result to stdout.
// Spawned by run-tests-tool.ts with env:{} so model code has no process.env access.
// Parent sets timeout (5000ms) via execSync; no signal handling needed here.
import { createInterface } from 'node:readline';

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(),
      kb = Object.keys(b).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

const rl = createInterface({ input: process.stdin, terminal: false });
let raw = '';
rl.on('line', (l) => {
  raw += l;
});
rl.on('close', () => {
  let code, paramNames, testCases;
  try {
    ({ code, paramNames, testCases } = JSON.parse(raw));
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ passed: 0, total: 0, errors: [`Parse error: ${String(e)}`] }),
    );
    process.exit(0);
  }

  let fn;
  try {
    fn = new Function(...paramNames, code);
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ passed: 0, total: testCases.length, errors: [`SyntaxError: ${String(e)}`] }),
    );
    process.exit(0);
  }

  let passed = 0;
  const errors = [];
  for (const tc of testCases) {
    try {
      const inputs = JSON.parse(JSON.stringify(tc.input));
      const got = fn(...inputs);
      if (deepEqual(got, tc.expected)) {
        passed++;
      } else {
        errors.push(
          `input=${JSON.stringify(tc.input)} expected=${JSON.stringify(tc.expected)} got=${JSON.stringify(got)}`,
        );
      }
    } catch (e) {
      errors.push(`input=${JSON.stringify(tc.input)} threw: ${String(e)}`);
    }
  }

  process.stdout.write(
    JSON.stringify({ passed, total: testCases.length, errors: errors.slice(0, 3) }),
  );
  process.exit(0);
});
