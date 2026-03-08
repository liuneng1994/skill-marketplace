import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import test from 'node:test';
import { installSkillFromBundle } from './index.js';

const fixtureBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');

test('installSkillFromBundle installs a Copilot CLI target into the project scope', async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-workspace-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-home-'));
  const result = await installSkillFromBundle({
    bundleDir: fixtureBundle,
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
    bundleDir: fixtureBundle,
    targetId: 'claude-code',
    scope: 'user',
    workspaceDir,
    homeDir,
  });

  assert.equal(result.installDir, path.join(homeDir, '.claude', 'skills', 'hello-world-skill'));
  const lockfile = JSON.parse(await readFile(result.lockfilePath, 'utf8'));
  assert.equal(lockfile.installs['claude-code:hello-world-skill'].version, '1.0.0');
});
