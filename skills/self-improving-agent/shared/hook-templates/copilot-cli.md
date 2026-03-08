# GitHub Copilot CLI hook snippet for Self Improving Agent

Merge this snippet into your Copilot CLI hook configuration.

- Memory root: `__MEMORY_ROOT__`
- Installed shared assets: `__SHARED_DIR__`

```json
{
  "env": {
    "SIA_MEMORY_ROOT": "__MEMORY_ROOT__"
  },
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "command": "node __SCRIPT_DIR__/session-start.mjs"
      }
    ],
    "preToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "type": "command",
        "command": "node __SCRIPT_DIR__/pre-tool.mjs"
      }
    ],
    "postToolUse": [
      {
        "matcher": "Bash",
        "type": "command",
        "command": "node __SCRIPT_DIR__/post-tool.mjs"
      }
    ],
    "errorOccurred": [
      {
        "type": "command",
        "command": "node __SCRIPT_DIR__/error.mjs"
      }
    ],
    "sessionEnd": [
      {
        "type": "command",
        "command": "node __SCRIPT_DIR__/session-end.mjs"
      }
    ]
  }
}
```

If your local Copilot CLI schema differs, keep the command paths and matcher intent, but adapt field names to your installed version.
