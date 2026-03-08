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
- Shared learned context: `__SIA_SHARED_CONTEXT__`
- Copilot-specific learned context: `__SIA_TARGET_CONTEXT__`
- Managed templates: `__SIA_MANAGED_TEMPLATE_ROOT__`

## Expected workflow

1. Install the skill through Skill Marketplace.
2. Review the generated Copilot hook snippet created by the installer.
3. Wire those hooks into your Copilot CLI configuration.
4. Let the skill accumulate memory under the generated `SIA_MEMORY_ROOT`.
5. If the managed context files above exist, review them before responding so the latest learned guidance is applied.

## Manual triggers

- `self-improve`
- `analyze today's lessons`
- `summarize this session's learning`
