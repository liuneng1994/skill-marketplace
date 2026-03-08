import path from 'node:path';

export const copilotTargetName = 'copilot-cli';

export function resolveCopilotCliInstallPaths({ scope = 'project', workspaceDir, homeDir }) {
  if (scope === 'project') {
    return {
      installRoot: path.join(workspaceDir, '.github', 'skills'),
      lockfilePath: path.join(workspaceDir, '.skill-marketplace', 'lock.json'),
    };
  }
  if (scope === 'user') {
    return {
      installRoot: path.join(homeDir, '.copilot', 'skills'),
      lockfilePath: path.join(homeDir, '.skill-marketplace', 'lock.json'),
    };
  }
  throw new Error(`Unsupported Copilot CLI install scope: ${scope}`);
}
