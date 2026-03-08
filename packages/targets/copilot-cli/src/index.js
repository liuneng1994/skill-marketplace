import path from 'node:path';

export const copilotTargetName = 'copilot-cli';

export function resolveCopilotCliInstallPaths({ scope = 'project', workspaceDir, homeDir }) {
  if (scope === 'project') {
    const stateRoot = path.join(workspaceDir, '.skill-marketplace');
    return {
      installRoot: path.join(workspaceDir, '.github', 'skills'),
      stateRoot,
      lockfilePath: path.join(stateRoot, 'lock.json'),
    };
  }
  if (scope === 'user') {
    const stateRoot = path.join(homeDir, '.skill-marketplace');
    return {
      installRoot: path.join(homeDir, '.copilot', 'skills'),
      stateRoot,
      lockfilePath: path.join(stateRoot, 'lock.json'),
    };
  }
  throw new Error(`Unsupported Copilot CLI install scope: ${scope}`);
}
