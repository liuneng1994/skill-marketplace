# Self-improving-agent learning loop design

Date: 2026-03-08

## Goal

Document the shipped self-improvement loop for the marketplace version of `self-improving-agent`: hooks capture session telemetry, `analyze-session` consolidates it into episodic and semantic memory, and the learned output is applied only to marketplace-managed state under `.skill-marketplace/<slug>/`.

## Scope

This design covers the implemented runtime for:

- shared hook-driven event capture across GitHub Copilot CLI and Claude Code
- session-end analysis that writes episodic summaries plus shared and target-specific semantic memory
- managed context and template overlays under `.skill-marketplace/self-improving-agent/managed/`
- installer/bootstrap behavior needed to wire memory roots and generated hook snippets
- manual lifecycle commands for `self-improve analyze`, `inspect`, and `reset` (plus the shipped `replay` alias)

## Approaches considered

### 1. Mutate installed skill files directly

- apply learned guidance back into the installed `SKILL.md` and shared bundle files
- simplest mental model, but makes reinstalls unpredictable and mixes shipped assets with runtime state

### 2. Shared memory only

- keep one global learned store with no target overlay layer
- cheaper to implement, but loses client-specific guidance for Copilot CLI versus Claude Code hook behavior

### 3. Managed-state learning loop (shipped)

- keep bundle assets stable after install
- write learned state into `.skill-marketplace/<slug>/memory/` and render consumable overlays into `.skill-marketplace/<slug>/managed/`
- separate shared learning from target-specific overlays so both clients can reuse one skill identity without collapsing their runtime differences

## Chosen design

### Target hooks feed one shared recorder

The installer generates hook snippets under `.skill-marketplace/self-improving-agent/generated-hooks/<target>.md` and leaves merge decisions to the user instead of editing client config in place.

- **Copilot CLI** wires `sessionStart`, `preToolUse`, `postToolUse`, `errorOccurred`, and `sessionEnd` to Node entrypoints in `shared/hook-scripts/copilot-cli/`
- **Claude Code** wires `PreToolUse`, `PostToolUse`, and `Stop` to Bash wrappers in `shared/hook-scripts/claude-code/`; failed `PostToolUse` calls also emit an explicit `error` event
- both targets call the shared `record-event.mjs` runtime

`record-event.mjs` appends raw JSON lines to `memory/working/events.jsonl`, updates `memory/working/current_session.json`, stores `last_error.json` and `session_end.json` markers, trims the in-flight session to the most recent 25 events, and rotates the event log once it exceeds the retention threshold. Rotation is bounded by `retention.json` (default `128 KiB`, `5` archives).

### Session-end analysis consolidates learning

At session end, the target hook records the final event and then invokes `analyzeAndApply()` from `shared/hook-scripts/analyze-session.mjs`.

The analyzer:

1. acquires `.skill-marketplace/self-improving-agent/locks/analyzer.lock` with a 5 second timeout
2. ensures the managed state directories exist and migrates legacy `semantic-patterns.json` if present
3. summarizes the current session into event counts, top tools, failed tools, and recent error samples
4. derives candidate learning items for:
   - shared patterns
   - anti-patterns
   - corrections
   - target-specific patterns
5. upserts those items into JSON stores with confidence and occurrence tracking
6. writes a timestamped episodic record under `memory/episodic/sessions/`
7. renders managed context and template overlays
8. persists `memory/working/last_analysis.json`
9. resets `memory/working/current_session.json` for the next session

The current candidate builder is intentionally simple and runtime-driven: larger sessions reinforce an iterative validation pattern, failures create anti-patterns and corrective guidance, and dominant or failure-prone tools create target-specific workflow hints.

### Memory is split into shared, target, and episodic layers

The shipped memory model is:

```text
.skill-marketplace/self-improving-agent/
├── memory/
│   ├── episodic/sessions/<timestamp>.json
│   ├── semantic/shared-patterns.json
│   ├── semantic/anti-patterns.json
│   ├── semantic/corrections.json
│   ├── semantic/targets/<target>.json
│   └── working/events.jsonl + current_session.json + retention.json + last_analysis.json
├── managed/
│   ├── context/shared.md
│   ├── context/<target>.md
│   └── templates/
│       ├── shared/{pattern,correction,validation}-template.md
│       └── <target>/instruction-overlay.md
└── locks/
```

- **episodic memory** stores one rollup per analyzed session
- **shared semantic memory** stores cross-target patterns that should inform both clients
- **target semantic overlays** store client-specific workflow guidance under `semantic/targets/<target>.json`
- **managed context/templates** are regenerated artifacts that surface the learned state without changing the shipped bundle files

### Managed overlays are the application surface

Learning is auto-applied only to marketplace-managed artifacts:

- `managed/context/shared.md` summarizes the latest session plus top shared patterns, anti-patterns, and corrections
- `managed/context/<target>.md` adds target-specific overrides for the active client
- `managed/templates/shared/*.md` append learned patterns, corrections, and validation guidance to the base shared templates
- `managed/templates/<target>/instruction-overlay.md` renders the target-specific instruction delta

This keeps the installed bundle deterministic while still letting the next session consume updated context through installer-rendered placeholders such as `__SIA_SHARED_CONTEXT__`, `__SIA_TARGET_CONTEXT__`, and `__SIA_MANAGED_TEMPLATE_ROOT__`.

## Installer and CLI integration

Installation copies the target payload into the native client directory, copies shared assets into `<installed-skill>/shared`, bootstraps memory from `shared/bootstrap/memory`, renders hook snippets, and rewrites the installed `SKILL.md` placeholders so each target points at its managed memory and context files.

The CLI exposes the shipped runtime through:

- `node marketplace.mjs self-improve analyze self-improving-agent --target <target>`
- `node marketplace.mjs self-improve inspect self-improving-agent --target <target>`
- `node marketplace.mjs self-improve reset self-improving-agent --target <target>`
- `node marketplace.mjs self-improve replay self-improving-agent --target <target>`

`analyze` and `replay` run `analyzeAndApply()`, `inspect` returns the top learned entries plus managed paths, and `reset` clears learned stores and managed output before recreating empty state.

## Safety and operational defaults

- installer mutations use a separate `.skill-marketplace/locks/installer.lock`
- analyzer mutations are serialized independently through `analyzer.lock`
- generated hook snippets are review-and-merge artifacts, not direct config writes
- learned output stays in marketplace-managed state so reinstalling the bundle remains predictable
- runtime logs are bounded by rotation and archive trimming instead of growing forever

## Validation

The implemented loop is covered by runtime tests for log rotation and retention (`record-event.test.js`) plus analysis, managed overlay rendering, session archival, and reset behavior (`analyze-session.test.js`).
