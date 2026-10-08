import { graph } from '../src/agent.js';

// Collect tool names from all middleware
const tools = (graph.options.middleware ?? []).flatMap((mw) =>
  (mw.tools ?? []).map((t: { name: string }) => ({ name: t.name, middleware: mw.name })),
);

const toolNames = tools.map((t) => t.name);
const middlewareNames = (graph.options.middleware ?? []).map((mw) => mw.name);

process.stdout.write('Tools: ' + toolNames.join(', ') + '\n');
process.stdout.write('Middleware: ' + middlewareNames.join(', ') + '\n');

// Assertions
// execute: must not appear — filtered by FS_TOOLS allowlist in createFilesystemMiddleware
const executePresent = toolNames.includes('execute');
// task: excluded at model-call time by _ToolExclusionMiddleware, not removed from tools array
const taskExclusionMwPresent = middlewareNames.includes('_ToolExclusionMiddleware');
// FilesystemMiddleware: exactly one instance (no duplication from default + custom)
const fsMwCount = middlewareNames.filter((n) => n === 'FilesystemMiddleware').length;

if (executePresent) {
  process.stderr.write('FAIL: execute tool present — FS_TOOLS allowlist not applied\n');
  process.exit(1);
}
if (!taskExclusionMwPresent) {
  process.stderr.write(
    'FAIL: _ToolExclusionMiddleware absent — registerHarnessProfile excludedTools not applied\n',
  );
  process.exit(1);
}
if (fsMwCount !== 1) {
  process.stderr.write(`FAIL: FilesystemMiddleware count = ${fsMwCount}, expected exactly 1\n`);
  process.exit(1);
}

process.stdout.write(
  'PASS: execute absent, _ToolExclusionMiddleware present (task excluded at call-time), FilesystemMiddleware×1\n',
);
