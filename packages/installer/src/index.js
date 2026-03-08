import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { validateBundleDir } from '../../schema/src/index.js';
import { resolveCopilotCliInstallPaths } from '../../targets/copilot-cli/src/index.js';
import { resolveClaudeCodeInstallPaths } from '../../targets/claude-code/src/index.js';

function getTargetResolver(targetId) {
  if (targetId === 'copilot-cli') {
    return resolveCopilotCliInstallPaths;
  }
  if (targetId === 'claude-code') {
    return resolveClaudeCodeInstallPaths;
  }
  throw new Error(`Unsupported install target: ${targetId}`);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readLockfile(lockfilePath) {
  if (!(await pathExists(lockfilePath))) {
    return { installs: {} };
  }
  const raw = await readFile(lockfilePath, 'utf8');
  return JSON.parse(raw);
}

async function writeLockfile(lockfilePath, lockfile) {
  await mkdir(path.dirname(lockfilePath), { recursive: true });
  await writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
}

export async function installSkillFromBundle({
  bundleDir,
  targetId,
  scope = 'project',
  workspaceDir = process.cwd(),
  homeDir = os.homedir(),
  force = false,
}) {
  const validation = await validateBundleDir(bundleDir);
  if (!validation.ok) {
    throw new Error(`Bundle validation failed:\n${validation.errors.join('\n')}`);
  }

  const manifest = validation.manifest;
  const descriptor = manifest.targets[targetId];
  if (!descriptor) {
    throw new Error(`Target ${targetId} is not defined by ${manifest.slug}.`);
  }

  const resolveInstallPaths = getTargetResolver(targetId);
  const paths = resolveInstallPaths({ scope, workspaceDir, homeDir });
  const installDir = path.join(paths.installRoot, manifest.slug);
  if ((await pathExists(installDir)) && !force) {
    throw new Error(`Skill already installed at ${installDir}. Use --force to overwrite.`);
  }

  await mkdir(paths.installRoot, { recursive: true });
  await rm(installDir, { recursive: true, force: true });
  await cp(path.join(bundleDir, descriptor.path), installDir, { recursive: true });

  const lockfile = await readLockfile(paths.lockfilePath);
  lockfile.installs[`${targetId}:${manifest.slug}`] = {
    slug: manifest.slug,
    version: manifest.version,
    targetId,
    scope,
    installDir,
    bundleDir,
    updatedAt: new Date().toISOString(),
  };
  await writeLockfile(paths.lockfilePath, lockfile);

  return {
    slug: manifest.slug,
    version: manifest.version,
    targetId,
    scope,
    installDir,
    lockfilePath: paths.lockfilePath,
  };
}
