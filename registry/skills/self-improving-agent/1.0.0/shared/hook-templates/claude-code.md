# Claude Code hook snippet for Self Improving Agent

Use this snippet inside `.claude/settings.json` or `~/.claude/settings.json`.

- Memory root: `__MEMORY_ROOT__`
- Installed shared assets: `__SHARED_DIR__`

```json
{
  "env": {
    "SIA_MEMORY_ROOT": "__MEMORY_ROOT__"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash __SCRIPT_DIR__/pre-tool.sh \"$TOOL_NAME\" \"$TOOL_INPUT\""
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
            "command": "bash __SCRIPT_DIR__/post-tool.sh \"$TOOL_OUTPUT\" \"$EXIT_CODE\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash __SCRIPT_DIR__/session-end.sh"
          }
        ]
      }
    ]
  }
}
```

Keep the generated snippet under version control only if it contains no machine-specific paths.
