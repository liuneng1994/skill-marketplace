---
name: self-improving-agent
summary: Learn from Copilot CLI sessions with memory bootstrap, hook-driven event capture, and reusable pattern templates.
---

# Self Improving Agent for GitHub Copilot CLI

This skill teaches Copilot CLI to learn from tool usage, session endings, and repeated experiences.

## Included shared assets

- `shared/templates/` for new patterns, corrections, and validation notes
- `shared/references/appendix.md` for memory structure and review workflow
- `shared/hook-scripts/` for generated Copilot hook snippets
- Managed memory root: `__SIA_MEMORY_ROOT__`
- Global summary: `__SIA_GLOBAL_SUMMARY__`
- Global summary metadata: `__SIA_GLOBAL_SUMMARY_METADATA__`
- Global cleanup notice: `__SIA_GLOBAL_CLEANUP_NOTICE__`
- Shared learned context: `__SIA_SHARED_CONTEXT__`
- Copilot-specific learned context: `__SIA_TARGET_CONTEXT__`
- Managed templates: `__SIA_MANAGED_TEMPLATE_ROOT__`

## Expected workflow

1. Install the skill through Skill Marketplace.
2. Review the generated Copilot hook snippet created by the installer.
3. Wire those hooks into your Copilot CLI configuration.
4. Let the skill accumulate memory under the generated `SIA_MEMORY_ROOT`.
5. Review the compact global summary first to bring the highest-value shared lessons into context.
6. If the task clearly matches those lessons, retrieve the shared or Copilot-specific managed context on demand for the full detail.
7. If the global cleanup notice exists, tell the user that learned guidance should be reviewed or pruned.

## Manual triggers

- `self-improve`
- `analyze today's lessons`
- `summarize this session's learning`
