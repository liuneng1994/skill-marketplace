import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import { getInstallMetadata, getSkill, listSkills, publishBundle, readCatalog } from './store.js';

const helloWorldBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');
const selfImprovingBundle = path.join(process.cwd(), 'skills', 'self-improving-agent');

test('publishBundle stores a versioned skill in the registry catalog', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-registry-'));
  const published = await publishBundle({ bundleDir: helloWorldBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });
  assert.equal(published.slug, 'hello-world-skill');
  assert.deepEqual(published.supportedTargets, ['copilot-cli', 'claude-code']);

  const catalog = await readCatalog(registryDir);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0].latestVersion, '1.0.0');

  const install = await getInstallMetadata({ registryDir, slug: 'hello-world-skill', targetId: 'copilot-cli' });
  assert.equal(install.version, '1.0.0');
});

test('publishBundle captures self-improving-agent feature flags', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-registry-sia-'));
  await publishBundle({ bundleDir: selfImprovingBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });
  const skill = await getSkill({ registryDir, slug: 'self-improving-agent' });
  assert.equal(skill.features.memoryBootstrap, true);
  assert.deepEqual(skill.features.hookTargets, ['copilot-cli', 'claude-code']);
});

test('listSkills filters by target and query', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-registry-filter-'));
  await publishBundle({ bundleDir: helloWorldBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });
  await publishBundle({ bundleDir: selfImprovingBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });

  const targetFiltered = await listSkills({ registryDir, target: 'claude-code' });
  assert.equal(targetFiltered.length, 2);

  const queryFiltered = await listSkills({ registryDir, query: 'hooks' });
  assert.equal(queryFiltered.length, 1);
  assert.equal(queryFiltered[0].slug, 'self-improving-agent');
});
