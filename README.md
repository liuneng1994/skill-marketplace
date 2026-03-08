# Skill Marketplace

A standalone marketplace for publishing, discovering, installing, and updating skills that target GitHub Copilot CLI and Claude Code.

## What ships in this repository

- A file-backed registry/API with publish, list, detail, and install metadata endpoints
- A web marketplace that renders listings, compatibility badges, and install commands
- Shared manifest validation for multi-target skill bundles
- Target-aware installers for `copilot-cli` and `claude-code`
- An example multi-target skill bundle seeded into the local registry

## Repository layout

- `apps/web` — marketplace UI server
- `apps/api` — registry API and catalog store
- `apps/workers` — background indexing helpers
- `packages/schema` — manifest schemas and bundle validators
- `packages/sdk` — typed fetch client for the registry API
- `packages/installer` — install/update primitives and lockfile support
- `packages/targets/copilot-cli` — Copilot CLI install path adapters
- `packages/targets/claude-code` — Claude Code install path adapters
- `examples/hello-world-skill` — example marketplace bundle
- `registry/` — generated local registry catalog and published artifacts

## Marketplace manifest

Each skill bundle is described by `marketplace.skill.json` and declares one or more explicit targets:

- `copilot-cli`
- `claude-code`

Every target points to a native payload directory so the marketplace can preserve each client's expected filesystem layout.

## Quick start

Seed the example bundle into the local registry:

```bash
npm run seed
```

Start the API:

```bash
npm run dev:api
```

Start the web marketplace:

```bash
npm run dev:web
```

List published skills:

```bash
node marketplace.mjs list
```

Show details for one skill:

```bash
node marketplace.mjs show hello-world-skill
```

Install for GitHub Copilot CLI into the current workspace:

```bash
node marketplace.mjs install hello-world-skill --target copilot-cli --scope project
```

Install for Claude Code into the user-level skill directory:

```bash
node marketplace.mjs install hello-world-skill --target claude-code --scope user
```

## API endpoints

- `GET /health`
- `GET /api/skills`
- `GET /api/skills/:slug`
- `GET /api/skills/:slug/install?target=<target>&version=<version>`
- `POST /api/publish` with JSON body `{ "bundleDir": "..." }`

## Local product defaults

- Registry storage: `./registry`
- Copilot CLI project installs: `<workspace>/.github/skills/<slug>`
- Copilot CLI user installs: `~/.copilot/skills/<slug>`
- Claude Code project installs: `<workspace>/.claude/skills/<slug>`
- Claude Code user installs: `~/.claude/skills/<slug>`
- Lockfiles: `.skill-marketplace/lock.json` under the selected project or user root
