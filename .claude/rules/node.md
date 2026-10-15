---
paths:
  - 'apps/api/**/*.ts'
  - 'packages/**/*.ts'
  - 'experiments/**/*.ts'
  - 'scripts/**/*.{ts,mjs}'
---

# Node code (API, core, experiments, scripts)

- Env access is bracket notation only: `process.env['KEY']`
- Diagnostics go to `process.stderr.write(...)`, not `console` (ESLint warns on `no-console`)
- LangGraph Server needs the exact export names: `graph` in `apps/api/src/agent.ts`, `auth` in `apps/api/src/auth.ts`
- Shared utilities live in `packages/core` and are imported as `@deep-agents/core`, not by relative path
- Model calls run sequentially with `backoff.ts` on 429 and are counted with `RunCounter`
- File names are kebab-case
