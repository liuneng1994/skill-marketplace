# Hardening self-improving-agent and installer design

Date: 2026-03-08

## Goal

Address the main shortcomings identified in the self-improving-agent review by hardening installation safety, runtime durability, and lifecycle management in the skill marketplace.

## Scope

This round targets the fixes with the highest product and operational impact:

- add installer-level locking so concurrent installs and uninstalls cannot corrupt `.skill-marketplace/lock.json`
- rotate and trim `self-improving-agent` runtime event logs so memory state does not grow without bound
- render generated hook snippets with path-safe escaping instead of raw string substitution
- add an uninstall command that removes installed assets and marketplace-managed state for a skill
- enforce target `compatibility.minVersion` during install and uninstall when a client version is supplied

## Approaches considered

### 1. Reliability-only patch set

- Fix locking, log rotation, and safer hook rendering
- Leave lifecycle management and compatibility validation for later
- Lowest risk, but still leaves the product without a supported cleanup path

### 2. Full hardening pass (recommended)

- Fix reliability issues and add uninstall plus compatibility checks in one cohesive change
- Keeps CLI behavior aligned with installer internals and closes the biggest operational gaps in one release
- Slightly more implementation work, but the features reinforce each other

### 3. Runtime-heavy redesign

- Add analyzers, auto-consolidation, and smarter memory processing now
- Stronger long-term vision, but too much surface area for a hardening iteration

## Chosen design

Use approach 2.

### Installer and CLI

- Add an installer lock directory under `.skill-marketplace/locks/`
- Acquire the lock before any lockfile or install-state mutation and release it in a `finally` block
- Introduce `uninstallSkill()` in `packages/installer`
- Extend `marketplace.mjs` with `uninstall` usage and options matching install target resolution

### Compatibility checks

- Keep `compatibility.minVersion` in bundle metadata
- Validate it only when the caller provides `--client-version`
- Use a small internal semver comparator that accepts `x.y.z` numeric versions and fails loudly on invalid values
- Surface clear errors that name the target, required version, and supplied version

### Hook template safety

- Replace raw placeholder substitution with target-aware escaping helpers
- JSON snippet templates will receive JSON-string-safe path values
- Markdown prose placeholders will still render readable raw paths outside code blocks
- Generated snippets should continue to be review-and-merge artifacts rather than direct config writes

### Runtime durability

- Add log retention controls to `record-event.mjs`
- Keep appending to `working/events.jsonl`, but rotate the file when it exceeds a size threshold
- Preserve a bounded number of rotated files and trim the active session event summary as before
- Write a lightweight `retention.json` summary so operators can inspect the current policy

### Uninstall behavior

- Remove the installed target directory for the requested skill/target pair
- Remove generated hook files and bootstrapped memory under `.skill-marketplace/<slug>/` only when no other install entry still references the same slug
- Update `.skill-marketplace/lock.json` atomically under the installer lock
- Return a structured result showing what was removed and what was preserved

## Error handling

- Lock acquisition timeout should fail with an actionable message instead of waiting forever
- Invalid or missing lockfiles should fall back to an empty install map only when JSON parsing fails, never silently during partial writes
- Uninstalling a missing skill should return a clear error unless `--force` is supplied for cleanup
- Compatibility validation should happen before filesystem mutations

## Testing

- add installer tests for compatibility rejection, uninstall cleanup, and preserved shared state when multiple installs exist
- add installer tests that generated hook snippets safely encode paths with spaces and quotes
- add runtime tests for event log rotation and retention
- update CLI/build smoke coverage and README examples for the new uninstall and client-version flows
