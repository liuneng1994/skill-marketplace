# GitHub Copilot CLI hook snippet for Self Improving Agent

Merge this snippet into your Copilot CLI hook configuration.

- Memory root: `__MEMORY_ROOT_RAW__`
- Installed shared assets: `__SHARED_DIR_RAW__`

```json
{
  "env": {
    "SIA_MEMORY_ROOT": __MEMORY_ROOT_JSON__
  },
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "command": __COPILOT_SESSION_START_COMMAND_JSON__
      }
    ],
    "preToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "type": "command",
        "command": __COPILOT_PRE_TOOL_COMMAND_JSON__
      }
    ],
    "postToolUse": [
      {
        "matcher": "Bash",
        "type": "command",
        "command": __COPILOT_POST_TOOL_COMMAND_JSON__
      }
    ],
    "errorOccurred": [
      {
        "type": "command",
        "command": __COPILOT_ERROR_COMMAND_JSON__
      }
    ],
    "sessionEnd": [
      {
        "type": "command",
        "command": __COPILOT_SESSION_END_COMMAND_JSON__
      }
    ]
  }
}
```

If your local Copilot CLI schema differs, keep the command paths and matcher intent, but adapt field names to your installed version.
