# Experiment Workflows — T-DA-04 through T-DA-07

## T-DA-04 — Context Isolation Proof (Output 3)

```mermaid
flowchart LR
    subgraph A["Config A — Single Agent (3 runs)"]
        MA["Main Agent\nretrieves corpus directly"]
        TKA["peak_tokens_A"]
        MA --> TKA
    end

    subgraph B["Config B — Supervisor + Workers (3 runs)"]
        MB["Main Agent\norchestrates via task tool"]
        W1["Worker 1"]
        W2["Worker 2"]
        W3["Worker 3"]
        TKB["peak_tokens_B"]
        MB -->|task tool| W1
        MB -->|task tool| W2
        MB -->|task tool| W3
        MB --> TKB
    end

    subgraph M["Metrics"]
        RATIO["isolation_ratio = peak_B / peak_A"]
        GATE{ratio ≤ 0.50?}
        RATIO --> GATE
    end

    subgraph Q["Quality Gate"]
        CHECK["T-DA-03 checker passes\nfor BOTH configs"]
    end

    A --> M
    B --> M
    GATE -->|Yes| Q
    GATE -->|No| TUNE["add workers or tighten prompt"]
    Q --> DONE["Output 3 captured"]

    style DONE fill:#2d6a4f,color:#fff
```

## T-DA-05 — Critique Workflow

```mermaid
flowchart TD
    INIT["Producer writes initial draft\ncorpus/drafts/"] --> C

    subgraph Loop["≤ 3 rounds"]
        C["Critic Agent\nread_file · ls · glob · grep ONLY"]
        C_OUT["Numbered feedback\ncorpus/feedback/round-N.md"]
        DENY["Write to /drafts/ DENIED\nlogged in LangSmith trace"]
        HASH["Draft hash unchanged"]
        PREC["Critique Precision =\nvalid / total critiques"]
        REV["Producer revises draft"]

        C --> C_OUT --> HASH --> PREC --> REV --> C
        C --> DENY
    end

    Loop -->|"3 rounds complete"| DONE["Diff verified: all feedback addressed"]

    style DONE fill:#2d6a4f,color:#fff
    style DENY fill:#c1121f,color:#fff
```

## T-DA-06 — Harness Optimization Drills

```mermaid
flowchart LR
    SEL["benchmark/subset/\n20 TS problems\nbaseline fails ≥ 20%"]

    SEL --> S1["1. Baseline\ndefault agent"]
    S1 --> S2["2. Think Tool\n+54% expected"]
    S2 --> S3["3. CETC\n~84% token reduction"]
    S3 --> S4["4. Pre-completion\nchecklist middleware"]
    S4 --> S5["5. ReWOO\nfull DAG upfront"]

    S5 --> RPT["reports/harness-drills.md\npass_rate + cost per step"]

    style RPT fill:#1d3557,color:#fff
```

## T-DA-07 — Trace Analysis

```mermaid
flowchart LR
    LS["LangSmith traces\nT-DA-02 through T-DA-06"]

    subgraph SD["systematic-debugging — 4 phases"]
        P1["1. Reproduce\nidentify failing run"] --> P2["2. Isolate\ntool-call sequence"]
        P2 --> P3["3. Root cause\nspan → tool → expected vs actual"]
        P3 --> P4["4. Fix\nharness change only"]
    end

    subgraph EV["reports/trace-analysis.md"]
        FP1["Failure point 1:\nspan → tool → outcome"]
        FP2["Failure point 2:\nspan → tool → outcome"]
        BA["Before/after numbers"]
        META["deepagents_version + model_id\nin every span verified"]
    end

    LS --> SD --> EV --> DONE["≥ 2 failure points\n≥ 1 fix with numbers"]

    style DONE fill:#2d6a4f,color:#fff
```
