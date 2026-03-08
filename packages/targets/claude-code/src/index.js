import path from 'node:path';

export const claudeTargetName = 'claude-code';

export function resolveClaudeCodeInstallPaths({ scope = 'project', workspaceDir, homeDir }) {
  if (scope === 'project') {
    return {
      installRoot: path.join(workspaceDir, '.claude', 'skills'),
      lockfilePath: path.join(workspaceDir, '.skill-marketplace', 'lock.json'),
    };
  }
  if (scope === 'user') {
    return {
      installRoot: path.join(homeDir, '.claude', 'skills'),
      lockfilePath: path.join(homeDir, '.skill-marketplace', 'lock.json'),
    };
  }
  throw new Error(`Unsupported Claude Code install scope: ${scope}`);
}
