# DDR-015 — PC Loop: Critic as `task`-Tool Sub-Agent with Hash-Guard Middleware

**Date:** 2026-10-07
**Status:** Accepted
**Task:** T-DA-05 (revision)
**Related:** [[DDR-008]] (critic BRC permissions), [[DDR-013]] (sub-agent middleware injection)

---

## Context

T-DA-05 was initially implemented using direct TypeScript orchestration in `run.ts` (documented
in the T-DA-05 deviation note). The deviation resolution requires implementing the critic as a
real sub-agent via the `task` tool so the pattern demonstrates the CIP principle in the PC loop.

The design must:

1. Enforce the `/drafts/` immutability invariant at runtime (not just by promise)
2. Cap the critic at max 3 rounds with a visible refusal (not a silent limit)
3. Keep the critic BRC rules in a single shared location used by both the supervisor sub-agent
   and the standalone adversarial tests

Two verification questions were answered before implementation:

**V1 — `wrapToolCall` receives `subagent_type`:** CONFIRMED.
`ToolNode.js` builds `request = { toolCall: call, ... }` where `call.args` is the parsed tool
arguments object. For `task` calls: `call.args = { description: string, subagent_type: string }`.
Access via `request.toolCall.args['subagent_type']`.

**V2 — throw from `wrapToolCall` is a fatal run error:** CONFIRMED, with one constraint.
`utils.js` wraps the throw in `MiddlewareError`; `ToolNode.js` re-throws it because
`handleToolErrors !== true` (the default). The constraint: `wrapToolCall` MUST return
`ToolMessage | Command` on non-throw paths. Therefore:

- Hash violation → **throw** (fatal, terminates the run)
- Round cap → **return `ToolMessage` with `status: 'error'`** (supervisor sees the refusal)

---

## Decision

**Critic as a `task`-tool sub-agent; hash-guard middleware on the supervisor.**

### Critic spec (per-run factory)

`makeCriticSpec(workDir, modelConfig): SubAgent` in `critic-spec.ts`:

- `name: "critic"` — the sub-agent name the supervisor uses in the `task` call
- `middleware: [makeFilesystemMiddleware(backendFactory, CRITIC_PERMISSIONS, CRITIC_TOOLS)]` —
  same BRC rules as the standalone critic used in adversarial tests
- Backend created per-run with the run's `workDir` as root (per DDR-013)

`CRITIC_PERMISSIONS` and `CRITIC_TOOLS` are exported constants; `critic.ts` imports them so
standalone and sub-agent invocations share identical rules with no drift.

### Hash-guard middleware (on the supervisor)

`makeHashGuardMiddleware(workDir, maxRounds): { mw, getHashRecords, getRoundCount }` in
`hash-guard.ts`, using `createMiddleware` from `langchain`:

```typescript
wrapToolCall: async (request, handler) => {
  if (request.toolCall.name !== 'task') return handler(request);         // pass-through
  if (request.toolCall.args['subagent_type'] !== 'critic') return handler(request); // pass-through

  roundCount++;

  if (roundCount > maxRounds) {
    return new ToolMessage({ content: 'Round cap: ...', status: 'error', ... }); // refusal
  }

  const hashBefore = hashDraftsDir();
  const result = await handler(request);
  const hashAfter = hashDraftsDir();

  if (hashBefore !== hashAfter) throw new Error('BRC VIOLATION: critic modified /drafts/');
  return result;
};
```

### Supervisor permissions

Producer (supervisor) filesystem rules — first-match-wins:

```
allow write /drafts/**   (revisions)
allow write /notes/**    (revision notes)
deny  write /feedback/** (critic owns this)
deny  write /**          (catch-all)
```

### Middleware ordering on supervisor

`middleware: [hashGuard.mw, producerFsMw]`

Hash guard runs first: it intercepts `task` calls before `producerFsMw` sees them. The
`producerFsMw` governs the supervisor's own file writes; the hash guard governs round tracking
and invariant enforcement on sub-agent invocations.

---

## Why Not Direct Invocation Here

The original deviation note explained why direct invocation is simpler for tight sequential
orchestration (hashes + round state as TS variables, heterogeneous middleware per agent type).
Those reasons remain valid for the original `run.ts`.

The purpose of this implementation is to demonstrate the pattern itself — how `wrapToolCall`
intercepts sub-agent spawns, how per-run spec factories interact with `task`, and how the hash
invariant can be enforced by middleware rather than application code. The supervisor-run results
are recorded in `results/critique/supervisor-results.json`.

---

## Consequences

- `critic-spec.ts` is the single source of truth for critic BRC config; `critic.ts` imports from it
- The `makeHashGuardMiddleware` closure accumulates `hashRecords` per run — accessible after the
  run via `getHashRecords()` for measurement recording
- A 4th critic call returns a `ToolMessage` refusal; the supervisor can read the error and stop
  cleanly. A hash violation throws a fatal error — the run terminates with a clear message
- Custom middleware on the supervisor is NOT inherited by the critic sub-agent
  (`mergeMiddlewareStack appendNew:false` — DDR-013). The critic gets its BRC middleware only
  because it is explicitly included in `makeCriticSpec`

---

## References

- [[DDR-008]] — critic BRC permission design; adversarial evidence table
- [[DDR-013]] — sub-agent middleware must be injected per-run, not inherited
- `src/experiments/critique/critic-spec.ts` — shared spec factory
- `src/experiments/critique/hash-guard.ts` — hash-guard middleware
- `src/experiments/critique/supervisor-run.ts` — supervisor run script
- `results/critique/supervisor-results.json` — run measurements
