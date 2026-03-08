# Self Improving Agent Core Assets

This bundle contains the portable assets used by the Self Improving Agent across GitHub Copilot CLI and Claude Code.

## Included assets

- `bootstrap/memory/` — seed semantic memory plus empty episodic/working directories
- `templates/` — reusable pattern, correction, and validation templates
- `references/appendix.md` — supporting workflow and validation notes
- `hook-scripts/` — target-specific hook entrypoints plus the shared event recorder
- `hook-templates/` — generated-installation snippets for Copilot CLI and Claude Code

## Design goals

- keep one shared skill identity
- preserve traceable memory/bootstrap assets
- adapt hook wiring per client without forking the underlying learning model
