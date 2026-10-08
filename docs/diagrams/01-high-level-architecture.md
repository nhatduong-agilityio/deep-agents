# High-Level Architecture

The complete system across all three phases: core agent harness (T-DA), LangGraph Server backend (T-FS-01), and React frontend (T-FS-02).

## System Overview

```mermaid
graph TB
    subgraph FE["Frontend — apps/web (T-FS-02)"]
        Browser["Browser"]
        App["App.tsx"]
        Hook["useStream — @langchain/react 1.2.0"]
        Browser --> App --> Hook
    end

    subgraph BE["Backend — LangGraph Server (T-FS-01)"]
        LGS["langgraphjs dev — localhost:2024"]
        Agent["createDeepAgent() — deepagents 1.14.1"]
        LGS --> Agent
    end

    subgraph Runtime["Agent Runtime — LangGraph 1.4.18"]
        Graph["Compiled Graph"]
        Todos["write_todos (built-in)"]
        FS["FilesystemMiddleware"]
        SA["SubAgentMiddleware\n(disabled in T-FS v1)"]
        BGA["ThreadBudgetMiddleware\nafterModel/beforeModel — USD budget"]
        Graph --> Todos
        Graph --> FS
        Graph --> SA
        Graph --> BGA
    end

    subgraph LLM["LLM Providers"]
        GPT["GPT-5.4-mini — gpt-5.4-mini-2026-03-17\nprimary — all multi-turn loops"]
        Groq["Groq — single-call only\njudge and summarize"]
    end

    subgraph Obs["Observability"]
        LSM["LangSmith\nauto-trace via LANGSMITH_TRACING=true\nproject: deep-agents-phase"]
    end

    subgraph Storage["Storage (by task)"]
        Disk["FilesystemBackend\ndisk-persistent — T-DA-03 experiments"]
        Mem["CompositeBackend\nStateBackend default + /skills + /corpus\nT-FS-01"]
    end

    Hook -->|"POST /runs/stream (SSE)"| LGS
    Agent --> Graph
    Graph -->|tool calls| GPT
    Graph -->|single call| Groq
    Graph -.->|async trace| LSM
    Graph --> Disk
    Graph --> Mem
```

## Technology Stack

```mermaid
graph LR
    subgraph Node["Node 24 / pnpm 11"]
        TS["TypeScript 5.9.3 — NodeNext ESM"]
    end

    subgraph AgentLayer["Agent Layer"]
        DA["deepagents 1.14.1"]
        LG["@langchain/langgraph 1.4.18"]
        DA --> LG
    end

    subgraph ModelLayer["Model Layer"]
        OA["@langchain/openai 1.6.2 — GPT-5.4-mini"]
        GR["@langchain/groq 1.3.1 — Groq"]
    end

    subgraph ServerLayer["Server Layer"]
        API["@langchain/langgraph-api 1.5.1"]
        CLI["@langchain/langgraph-cli 1.5.1"]
        SDK["@langchain/langgraph-sdk 1.12.0"]
        CHK["@langchain/langgraph-checkpoint 1.1.5"]
    end

    subgraph FELayer["Frontend Layer"]
        RC["@langchain/react 1.2.0"]
        Vite["Vite 8.3.2"]
        R19["React 19.3.0"]
        RC --> R19
        Vite --> R19
    end

    subgraph TraceLayer["Tracing"]
        SM["langsmith 0.10.7"]
    end

    TS --> DA
    TS --> API
    TS --> RC
    DA --> OA
    DA --> GR
    DA --> SM
```

## Deployment Topology (T-FS-03)

```mermaid
graph LR
    subgraph Dev["Development"]
        FEDev["pnpm dev:web — localhost:5173"]
        BEDev["pnpm dev:server — localhost:2024"]
        FEDev -->|"CORS allow"| BEDev
    end

    subgraph Prod["Production"]
        CDN["CDN / Vercel\nVite static build"]
        Docker["Docker Container\nlanggraphjs dockerfile"]
        PG["Persistence\ndev: InMemorySaver → JSON file\nprod: [VERIFY]"]
        CDN -->|"REST + SSE + Bearer JWT (T-FS-00)"| Docker
        Docker --> PG
    end

    Dev -.->|"same agent code"| Prod
```
