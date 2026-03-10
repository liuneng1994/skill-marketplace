# Skill Marketplace repository instructions

## Build and test commands

- `npm run seed` publishes `examples/hello-world-skill` and `skills/self-improving-agent` into the local `registry/` and rebuilds `registry/search-index.json`. Run this before `npm run build` if the registry is empty or stale.
- `npm run build` is a validation build, not a transpile step. It validates both source bundles, expects the seeded registry to contain at least those bundles, renders the marketplace pages in memory, and verifies install metadata lookup.
- `npm test` runs the full Node test suite with `node --test`.
- Run one test file with `node --test apps/api/src/store.test.js`.
- Run one named test with `node --test --test-name-pattern="publishBundle stores a versioned skill in the registry catalog" apps/api/src/store.test.js`.
- Because `npm test` uses bare `node --test`, it also discovers mirrored tests inside `registry/skills/**` after seeding or publishing. If you only want source tests while iterating, run a file-specific command instead.
- Install directly from a git repository with `node marketplace.mjs install <slug> <git-url-or-path> [--ref <git-ref>] [--target <copilot-cli|claude-code>] ...`.
- When the current working tree already contains the requested bundle slug, `node marketplace.mjs install <slug> ...` installs from the local bundle source before falling back to the registry flow.
- `npm run dev:api` starts the API server from `apps/api/src/server.js` on port `3001`.
- `npm run dev:web` starts the web server from `apps/web/src/server.js` on port `3000`.
- Run CLI commands with `npm run cli -- <command>` or `node marketplace.mjs <command>`.

## High-level architecture

- The root CLI in `marketplace.mjs` is the orchestrator. It wires together the file-backed registry in `apps/api/src/store.js`, the search-index worker in `apps/workers/src/index.js`, the installer in `packages/installer/src/index.js`, and the self-improving-agent analyzer in `skills/self-improving-agent/shared/hook-scripts/analyze-session.mjs`.
- `apps/api/src/store.js` is the core domain layer. It validates bundles, copies published versions into `registry/skills/<slug>/<version>/`, maintains `registry/catalog.json`, and returns install metadata from those published copies.
- `apps/api/src/server.js` is a thin HTTP wrapper over the store module plus `rebuildSearchIndex()`. Keep API changes aligned with the store functions first.
- `apps/web/src/server.js` does not call the API over HTTP in local code paths. It imports `listSkills()` and `getSkill()` from `apps/api/src/store.js` directly, then renders HTML with `apps/web/src/index.js`.
- `packages/schema/src/index.js` owns the `marketplace.skill.json` contract. It validates target descriptors, bootstrap paths, and `SKILL.md` entrypoints, and derives feature flags with `summarizeManifestFeatures()`.
- `packages/installer/src/index.js` installs from published registry bundles, not from the source directories. All client-specific filesystem behavior is delegated to `packages/targets/copilot-cli/src/index.js` and `packages/targets/claude-code/src/index.js`.
- Repository installs also go through `packages/installer/src/index.js`: the CLI treats the optional second positional install argument as the repository source, clones it to a temporary checkout, resolves the requested bundle by `manifest.slug`, chooses the explicit target or defaults to the only supported target / `copilot-cli`, then delegates to the same bundle installer path as registry installs.
- `skills/self-improving-agent` is the reference complex bundle. It combines per-target `SKILL.md` entrypoints with shared assets, bootstrap memory, hook templates, and hook scripts. During install, the installer copies `shared/`, bootstraps `.skill-marketplace/<slug>/memory`, generates reviewable hook snippets under `.skill-marketplace/<slug>/generated-hooks/`, and replaces `__SIA_*__` placeholders in the installed `SKILL.md`.
- Treat `registry/skills/**` as generated output. Edit `skills/self-improving-agent/**` or `examples/hello-world-skill/**`, then republish or reseed.

## Key conventions

- Runtime code is plain ESM JavaScript. Many `index.ts` files are only `export * from './index.js'`; the `.js` files are the real implementation and the `.ts` files are compatibility barrels.
- The manifest is the source of truth for supported targets, install scope, compatibility, shared assets, memory bootstrap, and hook templates. The API catalog, install metadata, and web feature badges all derive from it.
- Publishing is a copy-and-index flow: `publishBundle()` validates a bundle, copies it into the versioned registry, computes a checksum, updates `registry/catalog.json`, and then callers rebuild `registry/search-index.json`.
- Search behavior is split today: publish writes `registry/search-index.json`, but `listSkills()` still filters directly from catalog fields, tags, targets, and feature flags. If you change search semantics, update both paths deliberately.
- The web detail page now renders copyable repository-install command snippets plus a copyable model prompt derived from `skill.repository.url`; keep those templates aligned with CLI syntax changes.
- Repository bundle discovery walks the repo looking for `marketplace.skill.json`, but intentionally skips generated locations like `registry/`, `.git/`, `node_modules/`, and `.skill-marketplace/`.
- Installer state is separate from installed skill files. Project installs go to `.github/skills/<slug>` for Copilot CLI and `.claude/skills/<slug>` for Claude Code; shared marketplace state lives under `.skill-marketplace/`.
- Install and uninstall operations are serialized with a directory lock at `.skill-marketplace/locks/installer.lock`. Preserve that locking behavior when changing installer flows.
- The installer intentionally does not overwrite Copilot CLI or Claude Code hook settings. It generates snippets for the user to merge instead.
- Lockfile entries now persist manifest metadata and optional git source metadata, so uninstall and compatibility checks do not depend on the original source checkout still existing.
- The self-improving-agent keeps telemetry in `.skill-marketplace/<slug>/memory/working/events.jsonl`, writes learned stores under `memory/semantic/`, writes managed overlays under `.skill-marketplace/<slug>/managed/`, and maintains the user-level summary under `~/.skill-marketplace/global/skills/<slug>/`.
- Tests are co-located with implementation files and use Node’s built-in `node:test` plus `node:assert/strict`; there is no separate test runner or transpilation step.
- The published registry copies preserve test files too, so the default full-suite run exercises both source bundle tests and the mirrored registry copies when they exist.
