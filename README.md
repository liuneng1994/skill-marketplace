# Skill Marketplace

A standalone marketplace for publishing, discovering, installing, and updating skills that target GitHub Copilot CLI and Claude Code.

## What ships in this repository

- A file-backed registry/API with publish, list, detail, and install metadata endpoints
- A web marketplace that renders listings, compatibility badges, and install commands
- Shared manifest validation for multi-target skill bundles
- Target-aware installers for `copilot-cli` and `claude-code`
- A first-class `self-improving-agent` bundle with memory bootstrap and hook templates
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
- `skills/self-improving-agent` — migrated multi-target bundle with shared assets and hook templates
- `examples/hello-world-skill` — example marketplace bundle
- `registry/` — generated local registry catalog and published artifacts

## Marketplace manifest

Each skill bundle is described by `marketplace.skill.json` and declares one or more explicit targets:

- `copilot-cli`
- `claude-code`

Optional bundle metadata can also describe:

- `shared.path` for portable assets copied into the installed skill directory
- `bootstrap.memory` for seeded memory files/directories
- `bootstrap.hooks` for target-specific hook template generation

## Quick start

Seed the built-in bundles into the local registry:

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
node marketplace.mjs show self-improving-agent
```

Install the migrated self-improving-agent for GitHub Copilot CLI into the current workspace:

```bash
node marketplace.mjs install self-improving-agent --target copilot-cli --scope project --client-version 0.1.0
```

Install the migrated self-improving-agent for Claude Code into the user-level skill directory:

```bash
node marketplace.mjs install self-improving-agent --target claude-code --scope user --client-version 0.1.0
```

Uninstall a skill target and clean marketplace-managed state when it is the last install for that skill:

```bash
node marketplace.mjs uninstall self-improving-agent --target claude-code --scope user --client-version 0.1.0
```

## Install behavior

For bundles that declare bootstrap metadata (such as `self-improving-agent`), installation now does three things:

1. copies the target payload into the client-native skills directory
2. copies any declared shared assets into `<installed-skill>/shared`
3. bootstraps memory and generated hook template files under `.skill-marketplace/<slug>/`
4. optionally enforces `compatibility.minVersion` when you pass `--client-version`

The installer does **not** silently overwrite your existing Copilot CLI or Claude Code hook settings. Instead it generates target-specific hook snippets you can review and merge intentionally.
It also serializes install and uninstall mutations through `.skill-marketplace/locks/installer.lock` so concurrent operations cannot corrupt marketplace state.

## Runtime durability

The migrated `self-improving-agent` keeps its event stream in `.skill-marketplace/<slug>/memory/working/events.jsonl`.

- the active log rotates automatically once it grows past the retention threshold
- old rotated files are trimmed to a bounded archive count
- `retention.json` records the active policy and the currently retained archives

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
- Marketplace state root: `<workspace-or-home>/.skill-marketplace`
- Lockfiles: `.skill-marketplace/lock.json`
- Generated hook templates for bootstrapped bundles: `.skill-marketplace/<slug>/generated-hooks/`
