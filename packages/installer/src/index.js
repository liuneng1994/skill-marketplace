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

function replacePlaceholders(template, replacements) {
  let result = template;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

async function installSharedAssets({ bundleDir, manifest, installDir }) {
  if (!manifest.shared?.path) {
    return undefined;
  }
  const sourceDir = path.join(bundleDir, manifest.shared.path);
  const sharedDir = path.join(installDir, 'shared');
  await cp(sourceDir, sharedDir, { recursive: true });
  return sharedDir;
}

async function bootstrapBundle({ bundleDir, manifest, targetId, stateRoot, installDir, sharedDir }) {
  const bootstrap = {};
  const bundleStateRoot = path.join(stateRoot, manifest.slug);

  if (manifest.bootstrap?.memory?.path) {
    const memorySourceDir = path.join(bundleDir, manifest.bootstrap.memory.path);
    const memoryRoot = path.join(bundleStateRoot, 'memory');
    bootstrap.memoryRoot = memoryRoot;
    bootstrap.memoryBootstrapped = false;
    if (!(await pathExists(memoryRoot))) {
      await mkdir(path.dirname(memoryRoot), { recursive: true });
      await cp(memorySourceDir, memoryRoot, { recursive: true });
      bootstrap.memoryBootstrapped = true;
    }
  }

  const hookDescriptor = manifest.bootstrap?.hooks?.[targetId];
  if (hookDescriptor && sharedDir) {
    const templateSourcePath = path.join(bundleDir, hookDescriptor.template);
    const templateContent = await readFile(templateSourcePath, 'utf8');
    const relativeScriptDir = manifest.shared?.path ? path.relative(manifest.shared.path, hookDescriptor.scripts) : hookDescriptor.scripts;
    const installedScriptDir = path.join(sharedDir, relativeScriptDir);
    const hookTemplatePath = path.join(bundleStateRoot, 'generated-hooks', `${targetId}.md`);
    const rendered = replacePlaceholders(templateContent, {
      '__MEMORY_ROOT__': bootstrap.memoryRoot ?? path.join(bundleStateRoot, 'memory'),
      '__SHARED_DIR__': sharedDir,
      '__SCRIPT_DIR__': installedScriptDir,
      '__INSTALL_DIR__': installDir,
      '__SKILL_SLUG__': manifest.slug,
    });
    await mkdir(path.dirname(hookTemplatePath), { recursive: true });
    await writeFile(hookTemplatePath, rendered, 'utf8');
    bootstrap.hookTemplatePath = hookTemplatePath;
    bootstrap.hookTemplateGenerated = true;
  }

  return Object.keys(bootstrap).length > 0 ? bootstrap : undefined;
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
  const sharedDir = await installSharedAssets({ bundleDir, manifest, installDir });
  const bootstrap = await bootstrapBundle({
    bundleDir,
    manifest,
    targetId,
    stateRoot: paths.stateRoot,
    installDir,
    sharedDir,
  });

  const lockfile = await readLockfile(paths.lockfilePath);
  lockfile.installs[`${targetId}:${manifest.slug}`] = {
    slug: manifest.slug,
    version: manifest.version,
    targetId,
    scope,
    installDir,
    bundleDir,
    bootstrap,
    updatedAt: new Date().toISOString(),
  };
  await writeLockfile(paths.lockfilePath, lockfile);

  return {
    slug: manifest.slug,
    version: manifest.version,
    targetId,
    scope,
    installDir,
    sharedDir,
    lockfilePath: paths.lockfilePath,
    bootstrap,
  };
}
