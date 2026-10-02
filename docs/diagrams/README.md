# Diagrams

All diagrams use [Mermaid](https://mermaid.js.org/) — render in GitHub, GitLab, VS Code (Markdown Preview), and JetBrains IDEs.

Each file is kept under ~40 nodes to avoid GitLab's performance warning. For pixel-perfect export run `pnpm diagrams` (generates SVGs into `img/`).

| File                                                                                      | What it shows                                                                                | Diagrams     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| [01-high-level-architecture](./01-high-level-architecture.md)                             | Full system: harness, providers, tracing, fullstack layers, deployment                       | 3            |
| [02-agent-graph](./02-agent-graph.md)                                                     | LangGraph nodes, state machine, built-in tools, BGA counter, CIP sub-agent flow              | 4            |
| [03-fullstack-architecture](./03-fullstack-architecture.md)                               | Browser → Server sequence, component tree, langgraph.json, thread lifecycle                  | 3            |
| [04a-workflows-scaffold-artifact](./04a-workflows-scaffold-artifact.md)                   | Experiment flows: T-DA-01 (scaffold), T-DA-02 (planning), T-DA-03 (artifact)                 | 3            |
| [04b-workflows-isolation-critique-harness](./04b-workflows-isolation-critique-harness.md) | Experiment flows: T-DA-04 (isolation), T-DA-05 (critique), T-DA-06 (drills), T-DA-07 (trace) | 4            |
| [05-agentic-patterns](./05-agentic-patterns.md)                                           | Pattern → task map, impact/effort table, implementation checklist                            | 1 + 2 tables |
| [06-data-flow](./06-data-flow.md)                                                         | Data lifecycle, corpus → report detail, FSC with/without, trace flow, aggregation            | 5            |

## Pre-rendering to SVG (optional)

```bash
pnpm diagrams          # renders all .mmd files in src/ → img/*.svg
```

Source `.mmd` files live in `src/` — one per diagram section. Edit there, re-run `pnpm diagrams`, commit both.
