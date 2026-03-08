# Skill marketplace design

Date: 2026-03-08

## Problem

Create a standalone GitHub repository for a full skill marketplace product that supports GitHub Copilot CLI and Claude Code.

## Goals

- Publish and version marketplace skills
- Support discovery, install, and update flows for Copilot CLI and Claude Code
- Preserve per-client native skill layouts instead of forcing one runtime format
- Surface provenance, trust, and moderation signals clearly

## Recommended architecture

Use a TypeScript monorepo with apps for the web marketplace, registry API, and background workers, plus packages for schema, SDK, installer logic, and target-specific adapters.

## Marketplace model

Each skill version contains one marketplace manifest plus explicit target payloads for:

- `copilot-cli`
- `claude-code`

The registry owns identity, provenance, compatibility metadata, and versioning. Target adapters own filesystem layout and install semantics for each client.

## Key components

1. Registry/API for publish, search, install metadata, version history, and moderation
2. Web UI for browsing skills and target-specific install instructions
3. Install/update adapters for Copilot CLI and Claude Code
4. Shared schema and validation package for marketplace manifests

## Trust model

- GitHub-linked publisher identity
- Immutable version records with content hashes
- Per-version source repository URL and changelog
- Moderation and reporting workflow
- Strict validation for target support declarations

## Rollout

1. Bootstrap monorepo and schema package
2. Add registry/API and artifact metadata flow
3. Add web marketplace and compatibility badges
4. Add install/update adapters for Copilot CLI and Claude Code
5. Add moderation, provenance, and search ranking
