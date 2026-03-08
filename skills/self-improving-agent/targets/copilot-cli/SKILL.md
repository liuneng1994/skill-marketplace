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

## Expected workflow

1. Install the skill through Skill Marketplace.
2. Review the generated Copilot hook snippet created by the installer.
3. Wire those hooks into your Copilot CLI configuration.
4. Let the skill accumulate memory under the generated `SIA_MEMORY_ROOT`.

## Manual triggers

- `self-improve`
- `analyze today's lessons`
- `summarize this session's learning`
