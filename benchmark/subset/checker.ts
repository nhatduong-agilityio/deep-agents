import type { Problem } from './problems.js';

export interface CheckResult {
  passed: number;
  total: number;
  passRate: number;
  errors: string[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

export function checkSolution(code: string, problem: Problem): CheckResult {
  const errors: string[] = [];
  let fn: (...args: unknown[]) => unknown;

  try {
    fn = new Function(...problem.paramNames, code) as (...args: unknown[]) => unknown;
  } catch (e) {
    return {
      passed: 0,
      total: problem.testCases.length,
      passRate: 0,
      errors: [`SyntaxError: ${String(e)}`],
    };
  }

  let passed = 0;
  for (const tc of problem.testCases) {
    try {
      // Deep-clone inputs so mutations don't pollute subsequent test cases
      const inputs = JSON.parse(JSON.stringify(tc.input)) as unknown[];
      const result = fn(...inputs);
      if (deepEqual(result, tc.expected)) {
        passed++;
      } else {
        errors.push(
          `input=${JSON.stringify(tc.input)} expected=${JSON.stringify(tc.expected)} got=${JSON.stringify(result)}`,
        );
      }
    } catch (e) {
      errors.push(`input=${JSON.stringify(tc.input)} threw: ${String(e)}`);
    }
  }

  return {
    passed,
    total: problem.testCases.length,
    passRate: passed / problem.testCases.length,
    errors,
  };
}
