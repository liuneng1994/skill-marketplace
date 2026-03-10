import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';
import { installSkillFromBundle, installSkillFromRepository, uninstallSkill } from './index.js';

const helloWorldBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');
const selfImprovingBundle = path.join(process.cwd(), 'skills', 'self-improving-agent');
const execFileAsync = promisify(execFile);

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args) {
  await execFileAsync('git', args);
}

async function createRepositoryFixture(sourceBundleDir, targetRelativeDir) {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-repo-fixture-'));
  const bundleDir = path.join(repoDir, targetRelativeDir);
  await mkdir(path.dirname(bundleDir), { recursive: true });
  await cp(sourceBundleDir, bundleDir, { recursive: true });
  await runGit(['init', repoDir]);
  await runGit(['-C', repoDir, 'config', 'user.name', 'Skill Marketplace Tests']);
  await runGit(['-C', repoDir, 'config', 'user.email', 'tests@example.com']);
  await runGit(['-C', repoDir, 'add', '.']);
  await runGit(['-C', repoDir, 'commit', '-m', 'fixture']);
  return repoDir;
}

test('installSkillFromBundle installs a Copilot CLI target into the project scope', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));
  const result = await installSkillFromBundle({
    bundleDir: helloWorldBundle,
    targetId: 'copilot-cli',
    scope: 'project',
    workspaceDir,
    homeDir,
  });

  assert.equal(result.installDir, path.join(workspaceDir, '.github', 'skills', 'hello-world-skill'));
  const skillFile = await readFile(path.join(result.installDir, 'SKILL.md'), 'utf8');
  assert.match(skillFile, /Hello World Skill for GitHub Copilot CLI/);
});

test('installSkillFromBundle installs a Claude Code target into the user scope and writes a lockfile', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));
  const result = await installSkillFromBundle({
    bundleDir: helloWorldBundle,
    targetId: 'claude-code',
    scope: 'user',
    workspaceDir,
    homeDir,
  });

  assert.equal(result.installDir, path.join(homeDir, '.claude', 'skills', 'hello-world-skill'));
  const lockfile = JSON.parse(await readFile(result.lockfilePath, 'utf8'));
  assert.equal(lockfile.installs['claude-code:hello-world-skill'].version, '1.0.0');
});

test('installSkillFromBundle bootstraps memory and hook templates for self-improving-agent', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));
  const result = await installSkillFromBundle({
    bundleDir: selfImprovingBundle,
    targetId: 'claude-code',
    scope: 'project',
    workspaceDir,
    homeDir,
  });

  assert.equal(result.installDir, path.join(workspaceDir, '.claude', 'skills', 'self-improving-agent'));
  assert.equal(result.sharedDir, path.join(result.installDir, 'shared'));
  const installedSkill = await readFile(path.join(result.installDir, 'SKILL.md'), 'utf8');
  assert.match(installedSkill, /Managed memory root:/);
  assert.match(installedSkill, /Global summary:/);
  assert.doesNotMatch(installedSkill, /__SIA_MEMORY_ROOT__/);
  assert.doesNotMatch(installedSkill, /__SIA_GLOBAL_SUMMARY__/);
  const template = await readFile(path.join(result.sharedDir, 'templates', 'pattern-template.md'), 'utf8');
  assert.match(template, /Pattern Template/);
  assert.ok(result.bootstrap?.memoryRoot);
  const semanticMemory = await readFile(path.join(result.bootstrap.memoryRoot, 'semantic-patterns.json'), 'utf8');
  assert.match(semanticMemory, /Document Separation for Complex PRDs/);
  const hookTemplate = await readFile(result.bootstrap.hookTemplatePath, 'utf8');
  assert.match(hookTemplate, /SIA_MEMORY_ROOT/);
  assert.match(hookTemplate, /session-end\.sh/);
});

test('installSkillFromBundle enforces target compatibility when clientVersion is provided', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));

  await assert.rejects(
    () =>
      installSkillFromBundle({
        bundleDir: selfImprovingBundle,
        targetId: 'claude-code',
        scope: 'project',
        workspaceDir,
        homeDir,
        clientVersion: '0.0.9',
      }),
    /requires claude-code version 0\.1\.0 or newer/,
  );
});

test('installSkillFromBundle defaults to copilot-cli when target is omitted for a multi-target bundle', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));

  const result = await installSkillFromBundle({
    bundleDir: helloWorldBundle,
    scope: 'project',
    workspaceDir,
    homeDir,
    clientVersion: '0.1.0',
  });

  assert.equal(result.targetId, 'copilot-cli');
  assert.equal(result.installDir, path.join(workspaceDir, '.github', 'skills', 'hello-world-skill'));
});

test('installSkillFromBundle renders hook snippets with safely encoded paths', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-paths-'));
  const workspaceDir = path.join(baseDir, 'workspace "quoted" path');
  const homeDir = path.join(baseDir, 'home "quoted" path');
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  const result = await installSkillFromBundle({
    bundleDir: selfImprovingBundle,
    targetId: 'claude-code',
    scope: 'project',
    workspaceDir,
    homeDir,
  });

  const hookTemplate = await readFile(result.bootstrap.hookTemplatePath, 'utf8');
  assert.match(hookTemplate, new RegExp(JSON.stringify(result.bootstrap.memoryRoot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(hookTemplate, /bash '.*pre-tool\.sh' \\"\$TOOL_NAME\\" \\"\$TOOL_INPUT\\"/);
});

test('uninstallSkill preserves shared state until the last target is removed', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));
  const claudeInstall = await installSkillFromBundle({
    bundleDir: selfImprovingBundle,
    targetId: 'claude-code',
    scope: 'project',
    workspaceDir,
    homeDir,
  });
  const copilotInstall = await installSkillFromBundle({
    bundleDir: selfImprovingBundle,
    targetId: 'copilot-cli',
    scope: 'project',
    workspaceDir,
    homeDir,
  });

  const firstRemoval = await uninstallSkill({
    slug: 'self-improving-agent',
    targetId: 'claude-code',
    scope: 'project',
    workspaceDir,
    homeDir,
  });
  assert.equal(firstRemoval.removed.installDir, true);
  assert.equal(firstRemoval.removed.hookTemplatePath, true);
  assert.equal(firstRemoval.removed.stateDir, false);
  assert.equal(await pathExists(copilotInstall.bootstrap.memoryRoot), true);
  assert.equal(await pathExists(copilotInstall.bootstrap.hookTemplatePath), true);

  const secondRemoval = await uninstallSkill({
    slug: 'self-improving-agent',
    targetId: 'copilot-cli',
    scope: 'project',
    workspaceDir,
    homeDir,
  });
  assert.equal(secondRemoval.removed.installDir, true);
  assert.equal(secondRemoval.removed.stateDir, true);
  assert.equal(await pathExists(path.join(workspaceDir, '.skill-marketplace', 'self-improving-agent')), false);
  assert.equal(await pathExists(claudeInstall.installDir), false);
});

test('installSkillFromRepository clones a git repo, resolves the requested skill slug, and persists source metadata', async () => {
  const repoDir = await createRepositoryFixture(helloWorldBundle, path.join('skills', 'hello-world-skill'));
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));

  const result = await installSkillFromRepository({
    repository: repoDir,
    slug: 'hello-world-skill',
    targetId: 'copilot-cli',
    scope: 'project',
    workspaceDir,
    homeDir,
    clientVersion: '0.1.0',
  });

  assert.equal(result.installDir, path.join(workspaceDir, '.github', 'skills', 'hello-world-skill'));
  assert.equal(result.source?.type, 'git');
  assert.equal(result.source?.repository, repoDir);
  assert.match(result.source?.commit ?? '', /^[0-9a-f]{40}$/);

  const lockfile = JSON.parse(await readFile(result.lockfilePath, 'utf8'));
  assert.equal(lockfile.installs['copilot-cli:hello-world-skill'].source.repository, repoDir);
  assert.equal(lockfile.installs['copilot-cli:hello-world-skill'].manifest.slug, 'hello-world-skill');

  const removal = await uninstallSkill({
    slug: 'hello-world-skill',
    targetId: 'copilot-cli',
    scope: 'project',
    workspaceDir,
    homeDir,
    clientVersion: '0.1.0',
  });
  assert.equal(removal.removed.installDir, true);
});

test('installSkillFromRepository defaults to copilot-cli when target is omitted for a multi-target bundle', async () => {
  const repoDir = await createRepositoryFixture(helloWorldBundle, path.join('skills', 'hello-world-skill'));
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));

  const result = await installSkillFromRepository({
    repository: repoDir,
    slug: 'hello-world-skill',
    scope: 'project',
    workspaceDir,
    homeDir,
    clientVersion: '0.1.0',
  });

  assert.equal(result.targetId, 'copilot-cli');
  assert.equal(result.installDir, path.join(workspaceDir, '.github', 'skills', 'hello-world-skill'));

  const lockfile = JSON.parse(await readFile(result.lockfilePath, 'utf8'));
  assert.equal(lockfile.installs['copilot-cli:hello-world-skill'].targetId, 'copilot-cli');
});
