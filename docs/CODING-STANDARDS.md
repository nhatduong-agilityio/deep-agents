# Coding Standards

Conventions observed in this project. Update when a new pattern is established.

## Import Style

- ESM throughout (`"type": "module"` in `package.json`; `"module": "NodeNext"` in `tsconfig.json`)
- Relative imports require explicit `.js` extension (NodeNext resolution): `import { x } from './lib/x.js'`
- Package imports use bare specifiers: `import { Client } from 'langsmith'`
- Named exports only — no default exports from utility or library files

## Provider Abstraction Pattern

- Primary model: `ChatGoogleGenerativeAI` from `@langchain/google-genai`
  - Alias (`gemini-2.0-flash`) for exploration scripts
  - Pinned version ID (e.g. `gemini-2.0-flash-001`) for all measured experiment runs
- Single-call roles only: `ChatGroq` from `@langchain/groq`
  - Never in multi-turn tool-calling loops (Groq `BadRequestError` on Qwen3 reasoning content)
- Agent harness: `createDeepAgent` from `deepagents`; returns a compiled LangGraph graph

## Testing Pattern

- Framework: Vitest (`vitest run` for CI, no watch by default)
- Files: `src/__tests__/*.test.ts`
- Structure: `describe` block per module, `it` for each behaviour
- Environment: `node` (set in `vitest.config.ts`); `apps/` excluded from root config
- No mocking of external HTTP — integration tests hit real APIs; unit tests use in-process fakes

## Tracing / Observability Pattern

- LangSmith auto-traces when `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are set (canonical names); `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` are accepted as legacy aliases
- Shared client: `import { langsmith } from '../index.js'` — do not construct `new Client()` per file
- Project: `LANGSMITH_PROJECT=deep-agents-phase` (set in `.env`)
- Every measured run must log its LangSmith run URL to stdout

## Comments

- Default: no comments
- Allowed: one line when the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- Forbidden: WHAT comments, section dividers, multi-line blocks, docstrings

## Naming Conventions

- Files: `kebab-case.ts`
- Functions / variables: `camelCase`
- Classes / types / interfaces: `PascalCase`
- Environment variable access: `process.env['KEY']` (bracket notation, never dot notation)
- Constants: `SCREAMING_SNAKE_CASE` for module-level compile-time values

## Error Handling

- Validate only at system boundaries (env var access, external API responses, user input)
- No defensive try/catch around internal code — let errors surface naturally
- `process.stderr.write(...)` for warnings that should not throw; never `console.warn` in library code
- No fallbacks that silently swallow failures in experiment scripts

## Dependency Management

- All versions pinned exact — no `^` or `~` in `package.json`
- Before adding any package: `npm show <pkg> version` to confirm latest, then pin
- Peer-dep mismatches: check whether the mismatch is in a runtime import path before treating as blocking
- `pnpm-workspace.yaml` is the single source of pnpm config (allowBuilds, minimumReleaseAgeExclude)
