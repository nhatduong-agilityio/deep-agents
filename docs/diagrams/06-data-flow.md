# Data Flow

How data moves through the system from input to output, per layer and per experiment.

## Overall Data Lifecycle

```mermaid
flowchart TD
    subgraph Inputs
        ENV[".env\nAPI keys"]
        CORPUS["corpus/\nEU AI Act + US EO\n≤10 .txt files"]
        USER["User message\nvia browser or CLI"]
        BENCH["benchmark/subset/\n20 TS problems"]
    end

    subgraph AgentRuntime["Agent Runtime"]
        IM["Input: HumanMessage\n+ system prompt\n+ tool definitions"]
        LLM["Gemini Flash\nchat completion"]
        TC["Tool calls\nread_file · write_file\nwrite_todos · task · think"]
        TM["ToolMessages\nresults back into context"]
        IM --> LLM --> TC --> TM --> LLM
    end

    subgraph Outputs
        RP["/report/\nsummary.md\nfindings/*.md\nsources.md"]
        FDB["corpus/feedback/\ncritic numbered items"]
        TR["LangSmith trace\nper-span token counts\nrun metadata"]
        RS["results/\nCSV run logs\npass rate tables"]
        RPT["reports/\nphase-report.md\ntrace-analysis.md"]
    end

    subgraph Validation
        CHK["check-report.ts\ndeterministic structure + citation check"]
        HASH["SHA-256 hash check\ndraft unchanged after critic"]
        GATE["Success gates\nper-task DoD"]
    end

    ENV --> AgentRuntime
    CORPUS --> AgentRuntime
    USER --> AgentRuntime
    BENCH --> AgentRuntime
    AgentRuntime --> Outputs
    Outputs --> Validation
    Validation -->|Pass| DONE["Evidence captured"]
    Validation -->|Fail| AgentRuntime
```

## Corpus → Artifact Agent → Report (T-DA-03 detail)

```mermaid
flowchart LR
    subgraph Corpus["corpus/ — fixed, read-only"]
        F1["eu-ai-act-art-6.txt"]
        F2["eu-ai-act-art-13.txt"]
        F3["us-eo-ai-section-4.txt"]
        FN["... up to 10 files"]
    end

    subgraph Agent["Artifact Agent — FilesystemBackend"]
        READ["read_file(path)\nreturns content"]
        ANALYZE["Gemini Flash:\nextract themes + citations"]
        TODOS["write_todos:\n1. read all corpus\n2. extract themes\n3. write findings\n4. write summary\n5. write sources"]
        WRITE["write_file(path, content)\nonly paths kept in messages"]

        TODOS --> READ --> ANALYZE --> WRITE
    end

    subgraph Report["/report/"]
        SUM["summary.md\n~500 words\nhigh-level synthesis"]
        F_1["findings/theme-1.md\n+ corpus citation"]
        F_2["findings/theme-2.md\n+ corpus citation"]
        F_3["findings/theme-3.md\n+ corpus citation"]
        SRC["sources.md\nfile path + excerpt ref per finding"]
    end

    subgraph Checker["check-report.ts"]
        S_CHECK["structure check:\nall required files present?"]
        C_CHECK["citation check:\neach finding references\na file in corpus/?"]
        RESULT{Pass?}
        S_CHECK --> C_CHECK --> RESULT
    end

    Corpus --> Agent
    Agent --> Report
    Report --> Checker
    RESULT -->|Yes| TRACE["Log LangSmith trace ID"]
    RESULT -->|No| Agent
```

## Message Flow Inside the Graph (FSC pattern)

```mermaid
flowchart LR
    subgraph BAD["WITHOUT FSC — context bloat"]
        M1["HumanMessage"] --> T1["read_file(doc1)"]
        T1 --> TM1["ToolMessage: full 10KB content"]
        TM1 --> T2["read_file(doc2)"]
        T2 --> TM2["ToolMessage: full 10KB content"]
        TM2 --> M2["write_file(summary)"]
        M2 --> NOTE1["⚠️ all raw content stays in context"]
    end

    subgraph GOOD["WITH FSC — paths only"]
        N1["HumanMessage"] --> N2["write_todos(...)"]
        N2 --> N3["read_file(doc1)"]
        N3 --> N4["write_file(findings/theme-1.md)"]
        N4 --> N5["ToolMessage: wrote path only"]
        N5 --> N6["clear_tool_uses"]
        N6 --> NOTE2["✓ only paths in context — ~84% token reduction"]
    end
```

## Trace Data Flow (AOT pattern)

```mermaid
flowchart LR
    subgraph RunConfig["runConfig.metadata (every run)"]
        V["deepagents_version: '1.14.1'"]
        M["model_id: 'gemini-2.0-flash-001'"]
        R["run_id: uuid"]
        T["task_id: 'T-DA-XX'"]
    end

    subgraph LGSpans["LangGraph spans (per step)"]
        AG["agent span\ninput_tokens, output_tokens"]
        TL["tools span\ntool_name, duration_ms"]
        SA["sub-agent span (if task tool)\nisolated context tokens"]
    end

    subgraph LangSmith["LangSmith project: deep-agents-phase"]
        RUN["Run record\n+ all metadata fields"]
        SPAN["Child spans\nper node execution"]
        URL["Run URL\nlogged to stdout after each run"]
    end

    RunConfig --> LGSpans
    LGSpans --> LangSmith
    URL -->|"pasted into"| PROGRESS["docs/PROGRESS.md\nactivity log"]
```

## Results Aggregation (per experiment)

```mermaid
flowchart TD
    subgraph Runs["N runs (≥3 or ≥10)"]
        R1["run_1: {tokens, cost, ms, tool_calls, pass}"]
        R2["run_2: {tokens, cost, ms, tool_calls, pass}"]
        RN["run_N: ..."]
    end

    subgraph Aggregation["results/<task>/summary.json"]
        AVG["avg_tokens\navg_cost_usd\navg_wall_ms\npass_rate"]
        P50["p50 / p95 token counts"]
        FAIL["failure_modes: []"]
    end

    subgraph Report["reports/ — human-readable"]
        TABLE["markdown table:\nstep | pass_rate | cost/task\nfor T-DA-06 harness drills"]
        TRACE["trace IDs for each run\nlinked in phase-report.md"]
    end

    Runs --> Aggregation --> Report
```
