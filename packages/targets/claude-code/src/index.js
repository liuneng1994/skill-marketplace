import path from 'node:path';

export const claudeTargetName = 'claude-code';

export function resolveClaudeCodeInstallPaths({ scope = 'project', workspaceDir, homeDir }) {
  if (scope === 'project') {
    const stateRoot = path.join(workspaceDir, '.skill-marketplace');
    return {
      installRoot: path.join(workspaceDir, '.claude', 'skills'),
      stateRoot,
      lockfilePath: path.join(stateRoot, 'lock.json'),
    };
  }
  if (scope === 'user') {
    const stateRoot = path.join(homeDir, '.skill-marketplace');
    return {
      installRoot: path.join(homeDir, '.claude', 'skills'),
      stateRoot,
      lockfilePath: path.join(stateRoot, 'lock.json'),
    };
  }
  throw new Error(`Unsupported Claude Code install scope: ${scope}`);
}
