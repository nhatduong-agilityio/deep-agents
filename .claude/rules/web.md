---
paths:
  - 'apps/web/**/*.{ts,tsx}'
---

# Web (apps/web)

- Relative imports keep the `.js` extension even in TSX (`import { App } from './App.js'`)
- Function components with named exports; panels use `export const X = memo(function X(props) {...})`
- Event handlers are named `useCallback`s (`handleSubmit`, `handleApprove`); derived values use `useMemo`
- Agent state comes from `useStream` (`@langchain/react`); never fetch inside `useEffect`
- Every interactive element has an `aria-label`/role — tests and e2e select by them (`getByRole('textbox', { name: /message input/i })`)
- Never put tokens in `VITE_*` vars or the bundle; the Vite `/api` proxy injects `AUTH_TOKEN`
- Styles: classes and tokens in `src/theme.css`; no inline styles
- `pnpm lint` does not cover this folder — run `pnpm exec eslint apps/web/src` or rely on lint-staged
