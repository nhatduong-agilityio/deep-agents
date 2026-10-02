# Diagrams

All diagrams use [Mermaid](https://mermaid.js.org/) — render in GitHub, VS Code (Markdown Preview), and JetBrains IDEs.

| File                                                          | What it shows                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [01-high-level-architecture](./01-high-level-architecture.md) | Full system: agent harness, providers, tracing, fullstack layers            |
| [02-agent-graph](./02-agent-graph.md)                         | LangGraph node/edge structure inside DeepAgents; state machine              |
| [03-fullstack-architecture](./03-fullstack-architecture.md)   | Request/response flow: browser → LangGraph Server → agent → SSE stream back |
| [04-experiment-workflows](./04-experiment-workflows.md)       | Per-task experiment flows: T-DA-02 through T-DA-07                          |
| [05-agentic-patterns](./05-agentic-patterns.md)               | Which patterns apply to which tasks; expected metric targets                |
| [06-data-flow](./06-data-flow.md)                             | Data lifecycle: corpus intake → agent processing → report → validation      |
