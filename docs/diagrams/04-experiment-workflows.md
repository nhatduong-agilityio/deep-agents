# Experiment Workflows

One diagram per experiment task (T-DA-01 through T-DA-07). Each shows the run loop, measurement points, and success gate.

## T-DA-01 — Scaffold + Reality Check

```mermaid
flowchart TD
    A["Install deepagents@1.14.1\nalready in package.json"] --> B["createDeepAgent()\nwith Gemini Flash + FilesystemBackend"]
    B --> C{Instantiates\nwithout error?}
    C -->|No| FIX["fix config\ncheck API keys"]
    C -->|Yes| D["Dump tool list →\ndocs/tool-list-default.json"]
    D --> E{write_todos\npresent?}
    E -->|No| ERR["STOP — unexpected;\ncheck deepagents version"]
    E -->|Yes| F["Run backoff.ts unit test\nmock 429 → verify retry"]
    F --> G["Run counter.ts\n4 dimensions: tokens/cost/ms/calls"]
    G --> H["Log deepagents version +\nGemini model ID to PROGRESS.md\nand as trace metadata"]
    H --> I["LangSmith trace URL\nlogged to stdout"]
    I --> DONE["DoD met"]

    style DONE fill:#2d6a4f,color:#fff
    style ERR fill:#c1121f,color:#fff
```

## T-DA-02 — Planning-First (Output 2)

```mermaid
flowchart LR
    subgraph Baseline["Baseline — 10 runs"]
        B_P["Default agent\nno planning instruction"]
        B_R["Record first_tool_name\nper run"]
        B_P --> B_R
    end

    subgraph Treatment["Treatment — 10 runs"]
        T_P["Agent + system prompt:\n'Call write_todos before\nany other action'"]
        T_C{First tool\n= write_todos?}
        T_P --> T_C
        T_C -->|Yes| T_OK["Record: PTR token overhead\ntodo count ≤10"]
        T_C -->|No| T_FAIL["Record failure\n(honest reporting)"]
    end

    subgraph Gate["Success Gate"]
        G{Treatment\n≥8/10 first = write_todos?}
        G -->|Yes| PASS["LangSmith trace URL\nOutput 2 captured"]
        G -->|No| TUNE["adjust system prompt\nre-run treatment"]
    end

    Baseline --> Gate
    Treatment --> Gate

    style PASS fill:#2d6a4f,color:#fff
```

## T-DA-03 — Artifact Agent (Output 1)

```mermaid
flowchart TD
    subgraph Corpus["corpus/ — fixed, read-only"]
        EU["EU AI Act\n.txt excerpts"]
        US["US Executive Order on AI\n.txt excerpts"]
    end

    subgraph Agent["Artifact Agent — FilesystemBackend"]
        READ["read_file corpus docs"]
        ANALYZE["LLM analysis\nper document"]
        WRITE["write_file\n→ /report/"]
        READ --> ANALYZE --> WRITE
    end

    subgraph Report["/report/ outputs"]
        SUM["summary.md\nhigh-level synthesis"]
        FIND["findings/\n≥3 .md files\none per theme"]
        SRC["sources.md\ncorpus citations"]
    end

    subgraph Checker["check-report.ts — deterministic"]
        STRUCT{File structure\ncorrect?}
        CITE{Every finding\ncites a corpus source?}
        STRUCT --> CITE
    end

    Corpus --> Agent
    Agent --> Report
    Report --> Checker
    Checker -->|Pass| TRACE["Record LangSmith trace ID\n(≥3 passing runs required)"]
    Checker -->|Fail| Agent

    style TRACE fill:#2d6a4f,color:#fff
```

## T-DA-04 — Context Isolation Proof (Output 3)

```mermaid
flowchart TD
    subgraph ConfigA["Config A — Single Agent (3 runs)"]
        MA["Main Agent\nretrieves corpus directly"]
        TKA["Measure:\nmain_agent_peak_tokens_A"]
        MA --> TKA
    end

    subgraph ConfigB["Config B — Supervisor + Workers (3 runs)"]
        MB["Main Agent\norchestrates via task tool"]
        W1["Worker 1\nfresh context"]
        W2["Worker 2\nfresh context"]
        W3["Worker 3 (optional)\nfresh context"]
        TKB["Measure:\nmain_agent_peak_tokens_B"]
        MB -->|task tool| W1 & W2 & W3
        MB --> TKB
    end

    subgraph Metrics["Metrics"]
        RATIO["isolation_ratio =\npeak_B / peak_A"]
        TOTAL["total_system_tokens_B\n(may be >> A — document it)"]
        GATE{ratio ≤ 0.50?}
    end

    subgraph Quality["Quality Gate"]
        CHECK["T-DA-03 checker passes\nfor BOTH configs"]
    end

    ConfigA --> Metrics
    ConfigB --> Metrics
    RATIO --> GATE
    GATE -->|Yes| Quality
    GATE -->|No| TUNE["add more workers\nor tighten delegation prompt"]
    Quality --> DONE["Output 3 captured\nLangSmith trace IDs"]

    style DONE fill:#2d6a4f,color:#fff
```

## T-DA-05 — Critique Workflow

```mermaid
flowchart TD
    INIT["Producer writes\ninitial draft → corpus/drafts/"]

    subgraph Loop["≤3 rounds"]
        C["Critic Agent\ntools: read_file · ls · glob · grep ONLY"]
        C_OUT["writes numbered feedback\n→ corpus/feedback/round-N.md"]
        ADV_TRY["Adversarial write\nattempt to /drafts/"]
        ADV_DENY["DENIED — FilesystemMiddleware\nlogs denial in LangSmith trace"]
        HASH["Verify draft hash\nunchanged after critic run"]
        REV["Producer reads feedback\nrevises draft"]
        PREC["Critique Precision =\nvalid_issues / total_critiques\n→ LangSmith trace metadata"]

        C --> C_OUT
        C --> ADV_TRY --> ADV_DENY
        C_OUT --> HASH
        HASH --> PREC
        PREC --> REV
        REV --> C
    end

    DONE["Diff verified:\nfinal draft addresses\nevery feedback item"]

    INIT --> Loop
    Loop -->|"3 rounds complete"| DONE

    style DONE fill:#2d6a4f,color:#fff
    style ADV_DENY fill:#c1121f,color:#fff
```

## T-DA-06 — Harness Optimization Drills

```mermaid
flowchart LR
    subgraph Subset["benchmark/subset/ — 20 TS problems"]
        SEL["Selection criterion:\nbaseline fails ≥20%"]
    end

    subgraph Steps["5 harness steps — ≥3 runs each"]
        S1["1. Baseline\ndefault agent"]
        S2["2. Think Tool\nno-op structured reflection\nexpected: +54% pass rate"]
        S3["3. CETC\nclear_tool_uses_20250919\nexpected: ~84% token reduction"]
        S4["4. Pre-completion\nchecklist middleware"]
        S5["5. ReWOO\nfull write_todos DAG upfront\nmeasure: model-call count reduction"]

        S1 --> S2 --> S3 --> S4 --> S5
    end

    subgraph Results["reports/harness-drills.md"]
        TABLE["pass_rate | cost_per_task\nfor each of 5 steps"]
    end

    Subset --> Steps
    Steps --> Results

    style TABLE fill:#1d3557,color:#fff
```

## T-DA-07 — Trace Analysis

```mermaid
flowchart TD
    LS["LangSmith traces\nfrom T-DA-02 through T-DA-06"]

    subgraph Analysis["systematic-debugging skill — 4 phases"]
        P1["1. Reproduce\nidentify failing run by trace ID"]
        P2["2. Isolate\npin tool-call sequence where drift starts"]
        P3["3. Root cause\nspan name → tool called → expected vs actual"]
        P4["4. Fix\nharness change (NOT prompt instruction)"]
        P1 --> P2 --> P3 --> P4
    end

    subgraph Evidence["reports/trace-analysis.md"]
        FP1["Failure point 1:\nspan_name → tool → outcome"]
        FP2["Failure point 2:\nspan_name → tool → outcome"]
        BA["Before/after numbers:\npass_rate or token_cost"]
        META["deepagents_version + model_id\nverified in every span metadata"]
    end

    LS --> Analysis
    Analysis --> Evidence
    Evidence --> DONE["≥2 failure points named\n≥1 harness fix with numbers"]

    style DONE fill:#2d6a4f,color:#fff
```
