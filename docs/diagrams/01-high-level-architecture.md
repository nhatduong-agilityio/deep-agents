# High-Level Architecture

The complete system across all three phases: core agent harness (T-DA), LangGraph Server backend (T-FS-01), and React frontend (T-FS-02).

## System Overview

```mermaid
graph TB
    subgraph FE["Frontend — apps/web (T-FS-02)"]
        Browser["Browser"]
        App["App.tsx"]
        Hook["useStream()\n@langchain/react 1.2.0"]
        Browser --> App --> Hook
    end

    subgraph BE["Backend — LangGraph Server (T-FS-01)"]
        LGS["langgraphjs dev\nlocalhost:2024"]
        Agent["createDeepAgent()\ndeepagents 1.14.1"]
        LGS --> Agent
    end

    subgraph Runtime["Agent Runtime — LangGraph 1.4.18"]
        Graph["Compiled Graph"]
        Todos["write_todos\n(built-in)"]
        FS["FilesystemMiddleware"]
        SA["SubAgentMiddleware"]
        BGA["counter.ts\nBudget Guard"]
        Graph --> Todos & FS & SA & BGA
    end

    subgraph LLM["LLM Providers"]
        Gemini["Gemini Flash\ngemini-2.0-flash-001\nprimary — all multi-turn loops"]
        Groq["Groq\nsingle-call only\njudge · summarize"]
    end

    subgraph Obs["Observability"]
        LSM["LangSmith\nauto-trace via LANGCHAIN_TRACING_V2\nproject: deep-agents-phase"]
    end

    subgraph Storage["Storage (by task)"]
        Disk["FilesystemBackend\ndisk-persistent\nT-DA-03 experiments"]
        Mem["StateBackend\nin-memory per thread\nT-FS-01 demo"]
    end

    Hook -->|"POST /runs/stream (SSE)"| LGS
    Agent --> Graph
    Graph -->|tool calls| Gemini
    Graph -->|single call| Groq
    Graph -.->|async trace| LSM
    Graph --> Disk & Mem
```

## Technology Stack

```mermaid
graph LR
    subgraph Node["Node 24 / pnpm 11"]
        TS["TypeScript 5.9.3\nNodeNext ESM"]
    end

    subgraph AgentLayer["Agent Layer"]
        DA["deepagents 1.14.1"]
        LG["@langchain/langgraph 1.4.18"]
        DA --> LG
    end

    subgraph ModelLayer["Model Layer"]
        GG["@langchain/google-genai 2.3.2\nGemini Flash"]
        GR["@langchain/groq 1.3.1\nGroq"]
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

    TS --> DA & API & RC
    DA --> GG & GR
    DA --> SM
```

## Deployment Topology (T-FS-03)

```mermaid
graph TB
    subgraph Prod["Production"]
        CDN["CDN / Vercel\nVite static build\nVITE_API_URL=prod-url"]
        Docker["Docker Container\nlanggraphjs dockerfile\n+ PostgreSQL checkpointer"]
        PG["PostgreSQL / Redis\ndurable execution\ncrash recovery + HITL"]
        CDN -->|"REST + SSE\nauth header"| Docker
        Docker --> PG
    end

    subgraph Dev["Development"]
        FEDev["pnpm dev:web\nlocalhost:5173"]
        BEDev["pnpm dev:server\nlocalhost:2024"]
        FEDev -->|"CORS allow"| BEDev
    end

    Dev -.->|"same agent code"| Prod
```
