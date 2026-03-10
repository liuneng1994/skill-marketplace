import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { readManifest, resolveBundleDirBySlug, validateBundleDir } from '../../schema/src/index.js';
import { resolveCopilotCliInstallPaths } from '../../targets/copilot-cli/src/index.js';
import { resolveClaudeCodeInstallPaths } from '../../targets/claude-code/src/index.js';

const installerLockTimeoutMs = 5_000;
const installerLockRetryMs = 100;
const simpleVersionPattern = /^\d+\.\d+\.\d+$/;
const execFileAsync = promisify(execFile);

function getTargetResolver(targetId) {
  if (targetId === 'copilot-cli') {
    return resolveCopilotCliInstallPaths;
  }
  if (targetId === 'claude-code') {
    return resolveClaudeCodeInstallPaths;
  }
  throw new Error(`Unsupported install target: ${targetId}`);
}

export function resolveInstalledSkillPaths({
  slug,
  targetId,
  scope = 'project',
  workspaceDir = process.cwd(),
  homeDir = os.homedir(),
}) {
  const resolveInstallPaths = getTargetResolver(targetId);
  const paths = resolveInstallPaths({ scope, workspaceDir, homeDir });
  const bundleStateRoot = path.join(paths.stateRoot, slug);
  const userStateRoot = path.join(homeDir, '.skill-marketplace');
  const globalSummaryRoot = path.join(userStateRoot, 'global', 'skills', slug);
  return {
    ...paths,
    installDir: path.join(paths.installRoot, slug),
    bundleStateRoot,
    memoryRoot: path.join(bundleStateRoot, 'memory'),
    managedRoot: path.join(bundleStateRoot, 'managed'),
    userStateRoot,
    globalSummaryRoot,
    globalSummaryPath: path.join(globalSummaryRoot, 'summary.md'),
    globalSummaryMetadataPath: path.join(globalSummaryRoot, 'summary.json'),
    globalSummaryCleanupPath: path.join(globalSummaryRoot, 'cleanup-recommendation.md'),
  };
}

function shellQuote(value) {
  const normalized = String(value);
  if (normalized.length === 0) {
    return "''";
  }
  return `'${normalized.replaceAll("'", "'\\''")}'`;
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function parseVersion(value, label) {
  if (typeof value !== 'string' || !simpleVersionPattern.test(value.trim())) {
    throw new Error(`${label} must be a numeric version like 1.2.3.`);
  }
  return value
    .trim()
    .split('.')
    .map((part) => Number(part));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, 'Client version');
  const rightParts = parseVersion(right, 'Minimum supported version');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function assertTargetCompatibility({ manifest, targetId, clientVersion }) {
  if (typeof clientVersion !== 'string' || clientVersion.trim() === '') {
    return;
  }
  const descriptor = manifest.targets?.[targetId];
  if (!descriptor) {
    throw new Error(`Target ${targetId} is not defined by ${manifest.slug}.`);
  }
  const minVersion = descriptor.compatibility?.minVersion;
  if (!minVersion) {
    return;
  }
  if (compareVersions(clientVersion, minVersion) < 0) {
    throw new Error(
      `${manifest.slug} requires ${targetId} version ${minVersion} or newer. Received ${clientVersion.trim()}.`,
    );
  }
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args) {
  try {
    return await execFileAsync('git', args);
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
    const command = ['git', ...args].join(' ');
    throw new Error(stderr ? `Git command failed (${command}): ${stderr}` : `Git command failed (${command}).`);
  }
}

function normalizeInstallSource(source) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const normalized = {};
  if (typeof source.type === 'string' && source.type.trim() !== '') {
    normalized.type = source.type.trim();
  }
  if (typeof source.repository === 'string' && source.repository.trim() !== '') {
    normalized.repository = source.repository.trim();
  }
  if (typeof source.ref === 'string' && source.ref.trim() !== '') {
    normalized.ref = source.ref.trim();
  }
  if (typeof source.commit === 'string' && source.commit.trim() !== '') {
    normalized.commit = source.commit.trim();
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

async function cloneRepository({ repository, ref }) {
  if (typeof repository !== 'string' || repository.trim() === '') {
    throw new Error('Repository must be a non-empty git URL or local git path.');
  }
  const checkoutDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-checkout-'));
  await runGit(['clone', '--quiet', repository.trim(), checkoutDir]);
  if (typeof ref === 'string' && ref.trim() !== '') {
    await runGit(['-C', checkoutDir, 'checkout', '--quiet', ref.trim()]);
  }
  const { stdout } = await runGit(['-C', checkoutDir, 'rev-parse', 'HEAD']);
  return {
    checkoutDir,
    commit: stdout.trim(),
  };
}

function resolveTargetId({ manifest, targetId }) {
  if (typeof targetId === 'string' && targetId.trim() !== '') {
    return targetId.trim();
  }
  const supportedTargetIds = Object.keys(manifest.targets ?? {});
  if (supportedTargetIds.includes('copilot-cli')) {
    return 'copilot-cli';
  }
  if (supportedTargetIds.length === 1) {
    return supportedTargetIds[0];
  }
  throw new Error(`Skill ${manifest.slug} supports multiple targets (${supportedTargetIds.join(', ')}), and no default target could be inferred. Pass --target explicitly.`);
}

function normalizeLockfile(lockfile) {
  const installs = lockfile && typeof lockfile === 'object' && lockfile.installs && typeof lockfile.installs === 'object' ? lockfile.installs : {};
  return { installs };
}

async function readLockfile(lockfilePath) {
  if (!(await pathExists(lockfilePath))) {
    return { lockfile: { installs: {} } };
  }

  const raw = await readFile(lockfilePath, 'utf8');
  try {
    return { lockfile: normalizeLockfile(JSON.parse(raw)) };
  } catch {
    const recoveredLockfilePath = `${lockfilePath}.corrupt-${Date.now()}`;
    await rename(lockfilePath, recoveredLockfilePath);
    return {
      lockfile: { installs: {} },
      recoveredLockfilePath,
    };
  }
}

async function writeLockfile(lockfilePath, lockfile) {
  await mkdir(path.dirname(lockfilePath), { recursive: true });
  const tempPath = `${lockfilePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
  await rename(tempPath, lockfilePath);
}

async function acquireInstallerLock(stateRoot) {
  const lockDir = path.join(stateRoot, 'locks', 'installer.lock');
  await mkdir(path.dirname(lockDir), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(
        path.join(lockDir, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8',
      );
      return { lockDir };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        if (Date.now() - startedAt >= installerLockTimeoutMs) {
          throw new Error(`Timed out waiting for installer lock at ${lockDir}. Another install or uninstall may still be running.`);
        }
        await sleep(installerLockRetryMs);
        continue;
      }
      throw error;
    }
  }
}

async function releaseInstallerLock(lock) {
  if (!lock) {
    return;
  }
  await rm(lock.lockDir, { recursive: true, force: true });
}

function replacePlaceholders(template, replacements) {
  let result = template;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

function createHookTemplateReplacements({ targetId, memoryRoot, sharedDir, installDir, installedScriptDir, slug, globalStateRoot }) {
  const replacements = {
    '__MEMORY_ROOT_RAW__': memoryRoot,
    '__MEMORY_ROOT_JSON__': JSON.stringify(memoryRoot),
    '__GLOBAL_STATE_ROOT_RAW__': globalStateRoot,
    '__GLOBAL_STATE_ROOT_JSON__': JSON.stringify(globalStateRoot),
    '__SHARED_DIR_RAW__': sharedDir,
    '__SHARED_DIR_JSON__': JSON.stringify(sharedDir),
    '__INSTALL_DIR_RAW__': installDir,
    '__INSTALL_DIR_JSON__': JSON.stringify(installDir),
    '__SCRIPT_DIR_RAW__': installedScriptDir,
    '__SCRIPT_DIR_JSON__': JSON.stringify(installedScriptDir),
    '__SKILL_SLUG_RAW__': slug,
    '__SKILL_SLUG_JSON__': JSON.stringify(slug),
  };

  if (targetId === 'copilot-cli') {
    return {
      ...replacements,
      '__COPILOT_SESSION_START_COMMAND_JSON__': JSON.stringify(`node ${shellQuote(path.join(installedScriptDir, 'session-start.mjs'))}`),
      '__COPILOT_PRE_TOOL_COMMAND_JSON__': JSON.stringify(`node ${shellQuote(path.join(installedScriptDir, 'pre-tool.mjs'))}`),
      '__COPILOT_POST_TOOL_COMMAND_JSON__': JSON.stringify(`node ${shellQuote(path.join(installedScriptDir, 'post-tool.mjs'))}`),
      '__COPILOT_ERROR_COMMAND_JSON__': JSON.stringify(`node ${shellQuote(path.join(installedScriptDir, 'error.mjs'))}`),
      '__COPILOT_SESSION_END_COMMAND_JSON__': JSON.stringify(`node ${shellQuote(path.join(installedScriptDir, 'session-end.mjs'))}`),
    };
  }

  if (targetId === 'claude-code') {
    return {
      ...replacements,
      '__CLAUDE_PRE_TOOL_COMMAND_JSON__': JSON.stringify(
        `bash ${shellQuote(path.join(installedScriptDir, 'pre-tool.sh'))} "$TOOL_NAME" "$TOOL_INPUT"`,
      ),
      '__CLAUDE_POST_TOOL_COMMAND_JSON__': JSON.stringify(
        `bash ${shellQuote(path.join(installedScriptDir, 'post-tool.sh'))} "$TOOL_OUTPUT" "$EXIT_CODE"`,
      ),
      '__CLAUDE_SESSION_END_COMMAND_JSON__': JSON.stringify(`bash ${shellQuote(path.join(installedScriptDir, 'session-end.sh'))}`),
    };
  }

  return replacements;
}

function createEntrypointReplacements({ targetId, bundleStateRoot, memoryRoot, managedRoot, globalSummaryPath, globalSummaryMetadataPath, globalSummaryCleanupPath }) {
  return {
    '__SIA_MEMORY_ROOT__': memoryRoot,
    '__SIA_GLOBAL_SUMMARY__': globalSummaryPath,
    '__SIA_GLOBAL_SUMMARY_METADATA__': globalSummaryMetadataPath,
    '__SIA_GLOBAL_CLEANUP_NOTICE__': globalSummaryCleanupPath,
    '__SIA_SHARED_CONTEXT__': path.join(managedRoot, 'context', 'shared.md'),
    '__SIA_TARGET_CONTEXT__': path.join(managedRoot, 'context', `${targetId}.md`),
    '__SIA_MANAGED_TEMPLATE_ROOT__': path.join(managedRoot, 'templates'),
    '__SIA_STATE_ROOT__': bundleStateRoot,
  };
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

async function bootstrapBundle({ bundleDir, manifest, targetId, stateRoot, installDir, sharedDir, globalStateRoot }) {
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
    const rendered = replacePlaceholders(
      templateContent,
      createHookTemplateReplacements({
        targetId,
        memoryRoot: bootstrap.memoryRoot ?? path.join(bundleStateRoot, 'memory'),
        sharedDir,
        installDir,
        installedScriptDir,
        slug: manifest.slug,
        globalStateRoot,
      }),
    );
    await mkdir(path.dirname(hookTemplatePath), { recursive: true });
    await writeFile(hookTemplatePath, rendered, 'utf8');
    bootstrap.hookTemplatePath = hookTemplatePath;
    bootstrap.hookTemplateGenerated = true;
  }

  return Object.keys(bootstrap).length > 0 ? bootstrap : undefined;
}

async function renderInstalledEntrypoint({ installDir, descriptor, targetId, bundleStateRoot, bootstrap, globalSummaryPath, globalSummaryMetadataPath, globalSummaryCleanupPath }) {
  const entrypointPath = path.join(installDir, descriptor.entrypoint);
  if (!(await pathExists(entrypointPath))) {
    return;
  }
  const content = await readFile(entrypointPath, 'utf8');
  const rendered = replacePlaceholders(
    content,
    createEntrypointReplacements({
      targetId,
      bundleStateRoot,
      memoryRoot: bootstrap?.memoryRoot ?? path.join(bundleStateRoot, 'memory'),
      managedRoot: path.join(bundleStateRoot, 'managed'),
      globalSummaryPath,
      globalSummaryMetadataPath,
      globalSummaryCleanupPath,
    }),
  );
  await writeFile(entrypointPath, rendered, 'utf8');
}

async function loadInstalledManifest(entry) {
  if (entry?.manifest && typeof entry.manifest === 'object') {
    return entry.manifest;
  }
  if (!entry?.bundleDir) {
    throw new Error('Installed skill metadata is missing manifest details, so compatibility cannot be verified.');
  }
  return readManifest(entry.bundleDir);
}

export async function installSkillFromBundle({
  bundleDir,
  targetId,
  scope = 'project',
  workspaceDir = process.cwd(),
  homeDir = os.homedir(),
  force = false,
  clientVersion,
  source,
}) {
  const validation = await validateBundleDir(bundleDir);
  if (!validation.ok) {
    throw new Error(`Bundle validation failed:\n${validation.errors.join('\n')}`);
  }

  const manifest = validation.manifest;
  const resolvedTargetId = resolveTargetId({ manifest, targetId });
  const descriptor = manifest.targets[resolvedTargetId];
  if (!descriptor) {
    throw new Error(`Target ${resolvedTargetId} is not defined by ${manifest.slug}.`);
  }
  assertTargetCompatibility({ manifest, targetId: resolvedTargetId, clientVersion });

  const paths = resolveInstalledSkillPaths({ slug: manifest.slug, targetId: resolvedTargetId, scope, workspaceDir, homeDir });
  const lock = await acquireInstallerLock(paths.stateRoot);

  try {
    const installDir = paths.installDir;
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
      targetId: resolvedTargetId,
      stateRoot: paths.stateRoot,
      installDir,
      sharedDir,
      globalStateRoot: paths.userStateRoot,
    });
    await renderInstalledEntrypoint({
      installDir,
      descriptor,
      targetId: resolvedTargetId,
      bundleStateRoot: paths.bundleStateRoot,
      bootstrap,
      globalSummaryPath: paths.globalSummaryPath,
      globalSummaryMetadataPath: paths.globalSummaryMetadataPath,
      globalSummaryCleanupPath: paths.globalSummaryCleanupPath,
    });

    const { lockfile, recoveredLockfilePath } = await readLockfile(paths.lockfilePath);
    lockfile.installs[`${resolvedTargetId}:${manifest.slug}`] = {
      slug: manifest.slug,
      version: manifest.version,
      targetId: resolvedTargetId,
      scope,
      installDir,
      bundleDir,
      manifest,
      bootstrap,
      source: normalizeInstallSource(source),
      updatedAt: new Date().toISOString(),
    };
    await writeLockfile(paths.lockfilePath, lockfile);

    return {
      slug: manifest.slug,
      version: manifest.version,
      targetId: resolvedTargetId,
      scope,
      installDir,
      sharedDir,
      lockfilePath: paths.lockfilePath,
      recoveredLockfilePath,
      bootstrap,
      source: normalizeInstallSource(source),
    };
  } finally {
    await releaseInstallerLock(lock);
  }
}

export async function installSkillFromRepository({
  repository,
  slug,
  ref,
  targetId,
  scope = 'project',
  workspaceDir = process.cwd(),
  homeDir = os.homedir(),
  force = false,
  clientVersion,
}) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new Error('install requires a <slug> argument');
  }

  const checkout = await cloneRepository({ repository, ref });
  try {
    const resolved = await resolveBundleDirBySlug(checkout.checkoutDir, slug.trim());
    const result = await installSkillFromBundle({
      bundleDir: resolved.bundleDir,
      targetId,
      scope,
      workspaceDir,
      homeDir,
      force,
      clientVersion,
      source: {
        type: 'git',
        repository,
        ref,
        commit: checkout.commit,
      },
    });

    return {
      ...result,
      source: {
        type: 'git',
        repository: repository.trim(),
        ref: typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : undefined,
        commit: checkout.commit,
      },
    };
  } finally {
    await rm(checkout.checkoutDir, { recursive: true, force: true });
  }
}

export async function uninstallSkill({
  slug,
  targetId,
  scope = 'project',
  workspaceDir = process.cwd(),
  homeDir = os.homedir(),
  force = false,
  clientVersion,
}) {
  const resolveInstallPaths = getTargetResolver(targetId);
  const paths = resolveInstallPaths({ scope, workspaceDir, homeDir });
  const installKey = `${targetId}:${slug}`;
  const lock = await acquireInstallerLock(paths.stateRoot);

  try {
    const { lockfile, recoveredLockfilePath } = await readLockfile(paths.lockfilePath);
    const entry = lockfile.installs[installKey];
    if (!entry && !force) {
      throw new Error(`Skill ${slug} is not installed for ${targetId} in ${scope} scope.`);
    }
    if (entry) {
      const manifest = await loadInstalledManifest(entry);
      assertTargetCompatibility({ manifest, targetId, clientVersion });
    }

    const installDir = entry?.installDir ?? path.join(paths.installRoot, slug);
    const result = {
      slug,
      targetId,
      scope,
      lockfilePath: paths.lockfilePath,
      recoveredLockfilePath,
      removed: {
        installDir: false,
        hookTemplatePath: false,
        stateDir: false,
        lockfileEntry: false,
      },
      preservedState: false,
    };

    if (await pathExists(installDir)) {
      await rm(installDir, { recursive: true, force: true });
      result.removed.installDir = true;
    }

    if (entry) {
      delete lockfile.installs[installKey];
      result.removed.lockfileEntry = true;
    }

    const remainingInstalls = Object.values(lockfile.installs);
    const remainingSlugInstalls = remainingInstalls.filter((install) => install.slug === slug);

    if (entry?.bootstrap?.hookTemplatePath && remainingSlugInstalls.length > 0 && (await pathExists(entry.bootstrap.hookTemplatePath))) {
      await rm(entry.bootstrap.hookTemplatePath, { force: true });
      result.removed.hookTemplatePath = true;
      result.preservedState = true;
    }

    const bundleStateRoot = path.join(paths.stateRoot, slug);
    if (remainingSlugInstalls.length === 0 && (await pathExists(bundleStateRoot))) {
      await rm(bundleStateRoot, { recursive: true, force: true });
      result.removed.stateDir = true;
    } else if (remainingSlugInstalls.length > 0) {
      result.preservedState = true;
    }

    await writeLockfile(paths.lockfilePath, lockfile);
    return result;
  } finally {
    await releaseInstallerLock(lock);
  }
}
