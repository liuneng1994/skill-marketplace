# Global summary and on-demand retrieval design

Date: 2026-03-08

## Goal

Make learned experience broadly available across supported clients without polluting always-on context. The system should keep a very small user-level global summary for the highest-value shared lessons, while retrieving deeper skill-specific and target-specific context only when the active task needs it.

## Scope

This design covers:

- a user-level global summary artifact for shared learning
- ranking and budgeting rules for what can enter that summary
- overflow handling through automatic compression and cleanup guidance
- on-demand retrieval of detailed memory, managed context, and template overlays
- shared behavior across Copilot CLI and Claude Code with thin target-specific overlays

This design does not replace the current episodic + semantic memory model or redefine the existing managed-state layout.

## Approaches considered

### 1. Full global injection

- Put all learned guidance into always-on global context
- Simple to reason about, but quickly causes context bloat, stale guidance, and irrelevant bias

### 2. Small global summary plus on-demand retrieval (chosen)

- Keep a strict-budget global summary with only the highest-signal shared lessons
- Retrieve detailed context from managed state only when the active skill or task warrants it
- Best balance between recall, relevance, and token safety

### 3. Retrieval only

- Keep no global learned summary and rely entirely on explicit retrieval
- Safest for context size, but loses the benefit of lightweight always-available learning

## Chosen design

### Global summary layer

Add one installer-managed user-level summary artifact that is shared across supported clients. It should contain only a bounded set of:

- high-confidence shared patterns
- recent high-signal corrections
- a small number of anti-pattern warnings

The summary is intentionally tiny, general, and biased toward guidance that helps across many tasks. Target-specific guidance stays out of the default summary unless it is both highly relevant and broadly safe.

### Ranking and budget rules

Every candidate summary item should be ranked before inclusion using signals already produced by the learning loop, including confidence, recurrence, recency, and shared applicability.

The summary should use two limits:

- **soft budget:** crossing it triggers automatic compaction
- **hard budget:** crossing it prevents any further growth beyond a compressed summary

Compaction should prefer:

1. deduplicating similar guidance
2. collapsing verbose items into shorter statements
3. dropping lower-value or older items before higher-signal shared lessons

### Overflow and cleanup behavior

When the soft budget is exceeded, the system should compress the summary automatically and record what was removed or archived. It should also produce a cleanup notice that explains the summary is being compacted and that user cleanup is recommended.

When the hard budget is exceeded, the system should refuse to expand the global summary further. The always-on artifact should remain a compressed summary plus a cleanup notice rather than continuing to accumulate detail.

### On-demand retrieval

Detailed learned state remains in marketplace-managed files, including:

- semantic memory for shared patterns, anti-patterns, and corrections
- target overlays
- managed context files
- managed templates

Runtime routing should keep the default global summary lightweight and only consult the richer learned state when the active skill, target, or task requires more detail. This preserves precision for everyday use while still making deeper learning available when there is a clear relevance signal.

### Shared core with target overlays

The existing shared-core plus target-specific overlay model remains intact.

- The global summary is shared across clients and should be derived primarily from shared lessons
- Copilot CLI and Claude Code can each retrieve thin target-specific overlays on demand
- The full learned corpus should not be duplicated into each client's always-on global context

### UX and inspectability

Users should be able to understand:

- what is always injected globally
- what is available only through retrieval
- whether the summary has been compacted
- when cleanup is recommended

Inspection output should surface summary size, item counts, refresh time, and compression or cleanup state so the budget behavior is debuggable rather than opaque.

## Validation

The design should be validated with tests that cover:

- ranking and truncation of summary candidates
- compression behavior at the soft budget
- refusal to grow past the hard budget
- cleanup metadata and user-facing guidance
- correct separation between global summary content and on-demand retrieved detail
- consistent behavior across shared and target-specific layers

## Non-goals

- replacing episodic or semantic memory storage
- moving all learning into client-global context
- removing target-specific overlays
- designing a new retrieval system for unrelated skills
