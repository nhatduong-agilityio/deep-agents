# Fullstack Architecture

How the React frontend (T-FS-02) connects to the LangGraph Server backend (T-FS-01) and streams responses.

## Request / Response Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as App.tsx (localhost:5173)
    participant Hook as useStream (@langchain/react)
    participant LGS as LangGraph Server (localhost:2024)
    participant Graph as DeepAgent Graph
    participant Gemini as Gemini Flash
    participant LS as LangSmith

    User->>UI: type message + submit
    UI->>Hook: submit({ messages: [HumanMessage] })
    Hook->>LGS: POST /runs/stream — X-Thread-Id: uuid
    LGS->>Graph: invoke(state, config)

    loop Agent loop
        Graph->>Gemini: chat completion (messages + tools)
        Gemini-->>Graph: AIMessage (tool_calls or final)
        Graph-->>LGS: SSE chunk — event: messages/partial
        LGS-->>Hook: SSE stream
        Hook-->>UI: re-render with partial messages
    end

    Graph->>Gemini: final response (no tool_calls)
    Gemini-->>Graph: AIMessage (content only)
    Graph-->>LGS: SSE chunk — event: messages/complete
    LGS-->>Hook: stream end
    Hook-->>UI: isLoading = false
    Graph-.->LS: async trace (full run)
```

## Component Architecture

```mermaid
graph TB
    subgraph Frontend["apps/web — Vite + React 19"]
        main["main.tsx\nReact.StrictMode root"]
        App["App.tsx\nuseStream wired to UI"]
        Input["MessageInput\ntext field + submit"]
        List["MessageList\nmaps messages → bubbles"]
        Stop["StopButton\ncalls stream.stop()"]

        main --> App
        App --> Input & List & Stop
    end

    subgraph Hook["useStream() — @langchain/react 1.2.0"]
        US["useStream({\n  apiUrl: 'http://localhost:2024',\n  assistantId: 'agent'\n})"]
        Returns["returns:\n{ messages, submit,\n  isLoading, stop }"]
        US --> Returns
    end

    subgraph Server["LangGraph Server — langgraphjs dev"]
        Routes["Built-in routes:\nPOST /runs/stream\nGET  /info\nGET  /runs/:id"]
        Manifest["langgraph.json\ngraphs.agent = src/agent.ts:graph\nenv = .env\nCORS = localhost:5173"]
    end

    App -->|"useStream config"| US
    Returns -->|"messages / isLoading / submit"| App
    US -->|"SSE"| Routes
    Routes --> Manifest
```

## langgraph.json Structure

```mermaid
graph LR
    subgraph langgraph.json
        G["graphs:\n  agent: ./src/agent.ts:graph"]
        E["env: .env"]
        N["node_version: 20"]
        C["http.cors:\n  allow_origins:\n    - http://localhost:5173"]
    end

    G -->|"tsx loads"| AT["src/agent.ts\nexport const graph =\ncreateDeepAgent({...})"]
    E -->|"injects"| ENV["GEMINI_API_KEY\nLANGCHAIN_API_KEY\n..."]
    C -->|"allows"| FE["Frontend at :5173"]
```

## Thread Lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> NoThread : page load
    NoThread --> Active : submit() — useStream creates thread_id
    Active --> Streaming : POST /runs/stream
    Streaming --> Active : stream complete — messages appended
    Active --> Streaming : follow-up submit() — same thread_id
    Active --> Stopped : stop() called
    Stopped --> Active : new submit()
    Active --> [*] : page close
```
