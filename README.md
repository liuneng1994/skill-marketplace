# Skill Marketplace

A standalone marketplace for publishing, discovering, installing, and updating skills that target GitHub Copilot CLI and Claude Code.

## Initial scope

- Registry/API for versioned skill publishing and discovery
- Web marketplace for search, trust signals, and install guidance
- Target-aware installers for `copilot-cli` and `claude-code`
- Shared marketplace manifest and validation rules

## Repository layout

- `apps/web` — marketplace UI
- `apps/api` — registry API
- `apps/workers` — background indexing and moderation jobs
- `packages/schema` — manifest schemas and validators
- `packages/sdk` — typed API client
- `packages/installer` — shared install/update primitives
- `packages/targets/copilot-cli` — Copilot CLI target adapters
- `packages/targets/claude-code` — Claude Code target adapters
- `docs/plans` — design and implementation docs
