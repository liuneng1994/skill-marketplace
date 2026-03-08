# Self-improving-agent migration design

Date: 2026-03-08

## Goal

Migrate the existing self-improving-agent into the skill-marketplace repository as a first-class multi-target marketplace bundle for GitHub Copilot CLI and Claude Code.

## Design

- Keep one shared bundle identity with two target payloads.
- Extract portable assets into `shared/`.
- Add target-specific `SKILL.md` wrappers for Copilot CLI and Claude Code.
- Extend marketplace metadata and installer flows so the skill can bootstrap memory files and generate hook configuration templates without overwriting user settings.

## Safety defaults

- Do not silently overwrite user hook configuration.
- Generate hook snippets/files under `.skill-marketplace/` and ask users to merge them intentionally.
- Reuse one shared memory model across both targets.
