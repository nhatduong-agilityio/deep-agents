# Agentic Patterns

Which patterns from [agentic-design.ai/patterns](https://agentic-design.ai/patterns) apply to which tasks, and the measurable target for each.

## Pattern-to-Task Map

```mermaid
graph LR
    subgraph Patterns
        PTR["PTR\nPlan & TODO Recitation"]
        FSC["FSC\nFilesystem as Context"]
        CIP["CIP\nContext Isolate Patterns"]
        PC["PC\nProducer-Critic"]
        BRC["BRC\nBlast-Radius Containment"]
        CETC["CETC\nTool-Result Clearing"]
        BGA["BGA\nBudget-Guarded Autonomy"]
        AOT["AOT\nAgent Observability & Tracing"]
        SVW["SVW\nSupervisor-Worker"]
        ReWOO["ReWOO\nPlan-Execute Decoupling"]
        Think["Think Tool\nStructured Reflection"]
        CAMS["CAMS\nCost-Aware Model Selection"]
    end

    subgraph Tasks
        DA01["T-DA-01\nScaffold"]
        DA02["T-DA-02\nPlanning-First"]
        DA03["T-DA-03\nArtifact Agent"]
        DA04["T-DA-04\nContext Isolation"]
        DA05["T-DA-05\nCritique Workflow"]
        DA06["T-DA-06\nHarness Drills"]
        DA07["T-DA-07\nTrace Analysis"]
        DDR03["DDR-003\nProvider Policy"]
    end

    PTR --> DA02 & DA06
    FSC --> DA03 & DA04
    CIP --> DA04
    PC  --> DA05
    BRC --> DA05
    CETC --> DA06
    BGA --> DA01
    AOT --> DA07
    SVW --> DA04
    ReWOO --> DA06
    Think --> DA06
    CAMS --> DDR03
```

## Pattern Reference Card

```mermaid
quadrantChart
    title Pattern impact vs implementation effort
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 High impact, high effort
    quadrant-2 High impact, low effort
    quadrant-3 Low impact, low effort
    quadrant-4 Low impact, high effort

    PTR: [0.25, 0.75]
    FSC: [0.30, 0.70]
    BGA: [0.35, 0.60]
    AOT: [0.20, 0.55]
    BRC: [0.25, 0.65]
    CIP: [0.55, 0.90]
    CETC: [0.45, 0.85]
    Think: [0.30, 0.80]
    SVW: [0.70, 0.85]
    ReWOO: [0.65, 0.75]
    PC: [0.60, 0.70]
    CAMS: [0.40, 0.50]
```

## Pattern Details + Metric Targets

```mermaid
mindmap
    root((Agentic Patterns))
        PTR — Plan & TODO Recitation
            Task: T-DA-02
            Impl: system prompt instructs write_todos first
            Target: ≥8/10 runs — first tool = write_todos
            Cap: ≤10 todo items to control token overhead
        FSC — Filesystem as Context
            Task: T-DA-03
            Impl: FilesystemBackend — large outputs to disk
            Rule: only file paths in agent messages
            Why: prevents context window saturation on long docs
        CIP — Context Isolate Patterns
            Task: T-DA-04
            Impl: task tool spawns fresh-context sub-agents
            Target: isolation_ratio = peak_B / peak_A ≤ 0.50
        BGA — Budget-Guarded Autonomy
            Task: T-DA-01
            Impl: counter.ts pre-step hook
            Dims: tokens · cost USD · wall ms · tool-call count
        BRC — Blast-Radius Containment
            Task: T-DA-05
            Impl: critic gets read_file ls glob grep ONLY
            Test: adversarial write to drafts/ must be denied
        PC — Producer-Critic
            Task: T-DA-05
            Impl: separate system prompts for each role
            Metric: Critique Precision = valid/total critiques
            Cap: ≤3 rounds
        CETC — Tool-Result Clearing
            Task: T-DA-06
            Impl: clear_tool_uses_20250919 middleware
            Target: ~84% token reduction on long runs
        Think Tool — Structured Reflection
            Task: T-DA-06
            Impl: no-op think tool + prompt examples
            Target: +54% on multi-step tasks
        SVW — Supervisor-Worker
            Task: T-DA-04
            Rule: ≤5 sub-agents to avoid diminishing returns
            Cost: ~15x token baseline — document threshold
        ReWOO — Plan-Execute Decoupling
            Task: T-DA-06
            Impl: full write_todos DAG upfront
            Measure: model-call count vs baseline
        AOT — Agent Observability & Tracing
            Task: T-DA-07
            Impl: LangSmith per-span token counts
            Required: deepagents_version + model_id in every span
        CAMS — Cost-Aware Model Selection
            DDR: DDR-003
            Policy: Gemini Flash primary — Groq single-call only
            Never: Qwen3 on Groq in multi-turn tool-calling loops
```

## Implementation Checklist by Pattern

| Pattern   | Where implemented                                              | Verified by                              |
| --------- | -------------------------------------------------------------- | ---------------------------------------- |
| **PTR**   | System prompt in `src/experiments/planning-first/treatment.ts` | ≥8/10 first-call rate in results         |
| **FSC**   | `new FilesystemBackend()` in `src/experiments/artifact-agent/` | `/report/` files on disk after run       |
| **CIP**   | `task` tool via SubAgentMiddleware (built-in)                  | isolation_ratio ≤ 0.50 in measure.ts     |
| **BGA**   | `src/lib/counter.ts` — pre-step hook in agent options          | unit test + real run logs                |
| **BRC**   | `createFilesystemMiddleware({ tools: [...] })` in critic.ts    | adversarial write denied in trace        |
| **PC**    | Separate `systemPrompt` strings for producer vs critic         | Critique Precision logged to LangSmith   |
| **CETC**  | `clear_tool_uses_20250919` middleware in harness step 3        | token count before/after in trace        |
| **Think** | Custom `think` tool added to agent in harness step 2           | pass rate delta in reports/              |
| **SVW**   | Worker count cap in config-b.ts: `maxWorkers: 5`               | sub-agent count in LangSmith spans       |
| **ReWOO** | System prompt forces full DAG in harness step 5                | model-call count reduction in reports/   |
| **AOT**   | `deepagents_version` + `model_id` in `runConfig.metadata`      | every span in LangSmith has these fields |
| **CAMS**  | Provider selection in `src/lib/models.ts` (T-DA-01)            | DDR-003 documents the policy             |
