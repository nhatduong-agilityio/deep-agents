# Agent Graph

Internal structure of the LangGraph graph that `createDeepAgent()` compiles. DeepAgents wires the nodes; we configure via options passed in.

## Graph Node Structure

```mermaid
flowchart TD
    START(["__start__"])
    AGENT["agent node\nChatGoogleGenerativeAI\ncalls tools or returns final answer"]
    TOOLS["tools node\nexecutes tool calls in parallel\nreturns ToolMessages"]
    END(["__end__"])

    START -->|"HumanMessage"| AGENT
    AGENT -->|"AIMessage with tool_calls"| TOOLS
    TOOLS -->|"ToolMessages"| AGENT
    AGENT -->|"AIMessage — no tool_calls"| END
```

## State Machine

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Idle
    Idle --> Planning : user message (write_todos first)
    Planning --> Executing : todos written
    Executing --> ToolCall : agent emits tool_call
    ToolCall --> Executing : tool result returned
    Executing --> BudgetCheck : pre-step hook
    BudgetCheck --> Executing : within budget
    BudgetCheck --> Halted : budget exceeded
    Executing --> Done : no tool_calls in response
    Done --> [*]
    Halted --> [*]
```

## Built-in Tools (deepagents 1.14.1 defaults)

```mermaid
graph LR
    subgraph Required["REQUIRED_MIDDLEWARE_NAMES"]
        FM["FilesystemMiddleware\nread_file · write_file\nls · glob · grep · mkdir"]
        SM["SubAgentMiddleware\ntask tool — spawns fresh-context sub-agent"]
    end

    subgraph BuiltIn["Built-in (always present)"]
        WT["write_todos\nPTR pattern — plan recitation"]
    end

    subgraph Optional["Optional / Experiment-specific"]
        TH["think\nno-op structured reflection\nT-DA-06"]
        CL["clear_tool_uses_20250919\nCETC — clears stale results\nT-DA-06"]
        CHK["pre_completion_checklist\nT-DA-06"]
    end

    FM --> Agent["Agent Node"]
    SM --> Agent
    WT --> Agent
    TH -.->|"added per experiment"| Agent
    CL -.->|"added per experiment"| Agent
    CHK -.->|"added per experiment"| Agent
```

## Budget Guard (BGA Pattern) — counter.ts

```mermaid
flowchart LR
    subgraph Counter["counter.ts — 4 dimensions"]
        TC["token_count\ncumulative input+output"]
        CO["cost_usd\nestimated at $0.075/1M input"]
        TM["wall_ms\nDate.now() delta"]
        CC["tool_call_count\nincremented each ToolNode exec"]
    end

    PreStep["pre-step hook"] -->|"read counter"| Guard{within budget?}
    Guard -->|Yes| AgentNode["Agent Node"]
    Guard -->|No| Halt["return HALT\nlog reason + final counter"]
    AgentNode -->|"after response"| Counter
```

## Sub-Agent Isolation (CIP Pattern) — task tool

```mermaid
sequenceDiagram
    participant Main as Main Agent (context A)
    participant Task as task tool (SubAgentMiddleware)
    participant Sub as Sub-Agent (fresh context B)
    participant FS as FilesystemBackend

    Main->>Task: task({ prompt, tools })
    Task->>Sub: spawn new graph instance — zero prior messages
    Sub->>FS: read / write files
    FS-->>Sub: file contents / paths
    Sub-->>Task: result summary (text only)
    Task-->>Main: ToolMessage — no raw file content
    Note over Main: main agent peak tokens measured here (config B)
```
