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

Install a skill directly from a git repository by repository address plus skill slug:

```bash
node marketplace.mjs install self-improving-agent https://github.com/liuneng1994/skill-marketplace.git --scope project --client-version 0.1.0
```

Install from a specific branch, tag, or commit:

```bash
node marketplace.mjs install self-improving-agent https://github.com/liuneng1994/skill-marketplace.git --ref main --scope project --client-version 0.1.0
```

If you are already inside the cloned repository, install from the current working tree without writing the repository address again:

```bash
node marketplace.mjs install self-improving-agent --scope project --client-version 0.1.0
```

For repository or local-working-tree installs, omit `--target` to use the bundle's only target or default to `copilot-cli` when the bundle supports multiple targets. Pass `--target claude-code` to override that default.

Uninstall a skill target and clean marketplace-managed state when it is the last install for that skill:

```bash
node marketplace.mjs uninstall self-improving-agent --target claude-code --scope user --client-version 0.1.0
```

Run the self-improvement analyzer manually for an installed skill:

```bash
node marketplace.mjs self-improve analyze self-improving-agent --target claude-code --scope project
```

Inspect the learned patterns and generated managed files:

```bash
node marketplace.mjs self-improve inspect self-improving-agent --target claude-code --scope project
```

## Install behavior

For bundles that declare bootstrap metadata (such as `self-improving-agent`), installation now does three things:

1. copies the target payload into the client-native skills directory
2. copies any declared shared assets into `<installed-skill>/shared`
3. bootstraps memory and generated hook template files under `.skill-marketplace/<slug>/`
4. optionally enforces `compatibility.minVersion` when you pass `--client-version`

When you pass a repository as the second positional install argument, the CLI clones that git repository into a temporary checkout, finds the bundle whose `marketplace.skill.json` has the requested `slug`, validates it, resolves a target (explicit `--target`, otherwise the only target or default `copilot-cli`), and then runs the same installer path as a registry-based install.

When no repository argument is provided, `marketplace.mjs install <slug>` first checks whether the current working tree already contains that skill bundle. If it does, installation runs directly from the local bundle source; otherwise the CLI falls back to the published registry flow.

The installer does **not** silently overwrite your existing Copilot CLI or Claude Code hook settings. Instead it generates target-specific hook snippets you can review and merge intentionally.
It also serializes install and uninstall mutations through `.skill-marketplace/locks/installer.lock` so concurrent operations cannot corrupt marketplace state.

## Runtime durability

The migrated `self-improving-agent` keeps its event stream in `.skill-marketplace/<slug>/memory/working/events.jsonl`.

- the active log rotates automatically once it grows past the retention threshold
- old rotated files are trimmed to a bounded archive count
- `retention.json` records the active policy and the currently retained archives

## Self-improvement pipeline

`self-improving-agent` now has two layers:

1. **Telemetry capture** — hooks write raw events into `memory/working/events.jsonl`
2. **Learning and auto-apply** — session-end analysis consolidates those events into:
   - episodic session records under `memory/episodic/sessions/`
   - shared semantic patterns under `memory/semantic/shared-patterns.json`
   - target-specific overlays under `memory/semantic/targets/<target>.json`
   - corrections and anti-patterns under `memory/semantic/`
   - a compact user-level global summary under `~/.skill-marketplace/global/skills/<slug>/`
   - managed context/template files under `.skill-marketplace/<slug>/managed/`

The shipped bundle assets stay stable. Learned improvements are auto-applied only to marketplace-managed memory and template artifacts, so reinstalling the bundle remains predictable.

## Global summary + on-demand retrieval

The self-improving-agent now uses a two-tier retrieval model:

1. **Small global summary** — a user-level summary carries only the highest-value shared lessons
2. **On-demand detail** — the full shared and target-specific managed contexts stay in the per-install state and are consulted only when relevant

The global summary is budgeted and automatically compressed when it grows too large.

- soft overflow: compress the summary and record cleanup recommendations
- hard overflow: hard-cap the summary and keep detailed guidance only in managed memory/context
- cleanup hints are written to `~/.skill-marketplace/global/skills/<slug>/cleanup-recommendation.md`

Use `self-improve inspect` to see the current global summary metadata, budget mode, and cleanup recommendations.

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
