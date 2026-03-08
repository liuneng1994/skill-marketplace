import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import { getInstallMetadata, listSkills, publishBundle, readCatalog } from './store.js';

const fixtureBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');

test('publishBundle stores a versioned skill in the registry catalog', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-registry-'));
  const published = await publishBundle({ bundleDir: fixtureBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });
  assert.equal(published.slug, 'hello-world-skill');
  assert.deepEqual(published.supportedTargets, ['copilot-cli', 'claude-code']);

  const catalog = await readCatalog(registryDir);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0].latestVersion, '1.0.0');

  const install = await getInstallMetadata({ registryDir, slug: 'hello-world-skill', targetId: 'copilot-cli' });
  assert.equal(install.version, '1.0.0');
});

test('listSkills filters by target and query', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-registry-filter-'));
  await publishBundle({ bundleDir: fixtureBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });

  const targetFiltered = await listSkills({ registryDir, target: 'claude-code' });
  assert.equal(targetFiltered.length, 1);

  const queryFiltered = await listSkills({ registryDir, query: 'starter' });
  assert.equal(queryFiltered.length, 1);
});
