import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import test from 'node:test';
import { installSkillFromBundle } from './index.js';

const helloWorldBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');
const selfImprovingBundle = path.join(process.cwd(), 'skills', 'self-improving-agent');

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
  const template = await readFile(path.join(result.sharedDir, 'templates', 'pattern-template.md'), 'utf8');
  assert.match(template, /Pattern Template/);
  assert.ok(result.bootstrap?.memoryRoot);
  const semanticMemory = await readFile(path.join(result.bootstrap.memoryRoot, 'semantic-patterns.json'), 'utf8');
  assert.match(semanticMemory, /Document Separation for Complex PRDs/);
  const hookTemplate = await readFile(result.bootstrap.hookTemplatePath, 'utf8');
  assert.match(hookTemplate, /SIA_MEMORY_ROOT/);
  assert.match(hookTemplate, /session-end\.sh/);
});
