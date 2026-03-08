# Claude Code hook snippet for Self Improving Agent

Use this snippet inside `.claude/settings.json` or `~/.claude/settings.json`.

- Memory root: `__MEMORY_ROOT_RAW__`
- Global state root: `__GLOBAL_STATE_ROOT_RAW__`
- Installed shared assets: `__SHARED_DIR_RAW__`

```json
{
  "env": {
    "SIA_MEMORY_ROOT": __MEMORY_ROOT_JSON__,
    "SIA_GLOBAL_STATE_ROOT": __GLOBAL_STATE_ROOT_JSON__
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": __CLAUDE_PRE_TOOL_COMMAND_JSON__
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": __CLAUDE_POST_TOOL_COMMAND_JSON__
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": __CLAUDE_SESSION_END_COMMAND_JSON__
          }
        ]
      }
    ]
  }
}
```

Keep the generated snippet under version control only if it contains no machine-specific paths.
