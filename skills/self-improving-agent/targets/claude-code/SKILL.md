---
name: self-improving-agent
summary: Learn from Claude Code sessions with memory bootstrap, hook-driven event capture, and reusable pattern templates.
---

# Self Improving Agent for Claude Code

This skill adapts the original self-improving-agent workflow to the marketplace bundle model while keeping Claude Code friendly hooks and memory guidance.

## Included shared assets

- `shared/templates/` for pattern, correction, and validation updates
- `shared/references/appendix.md` for memory structure and workflow notes
- `shared/hook-scripts/claude-code/` for generated Claude hook snippets
- Managed memory root: `__SIA_MEMORY_ROOT__`
- Shared learned context: `__SIA_SHARED_CONTEXT__`
- Claude-specific learned context: `__SIA_TARGET_CONTEXT__`
- Managed templates: `__SIA_MANAGED_TEMPLATE_ROOT__`

## Expected workflow

1. Install the skill through Skill Marketplace.
2. Merge the generated Claude hook snippet into your settings.
3. Review the bootstrapped memory directory before sharing or committing it.
4. Use the skill to summarize lessons, reinforce patterns, and capture errors.
5. If the managed context files above exist, review them before responding so the latest learned guidance is applied.

## Manual triggers

- `自我进化`
- `self-improve`
- `summarize this session's learning`
