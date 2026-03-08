import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';
import { createApiServer } from './server.js';
import { publishBundle } from './store.js';

const fixtureBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');

test('createApiServer exposes health, listing, detail, and install endpoints', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-api-'));
  await publishBundle({ bundleDir: fixtureBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });

  const server = createApiServer({ registryDir });
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const listing = await fetch(`${baseUrl}/api/skills`).then((response) => response.json());
    assert.equal(listing.skills.length, 1);

    const detail = await fetch(`${baseUrl}/api/skills/hello-world-skill`).then((response) => response.json());
    assert.equal(detail.skill.slug, 'hello-world-skill');

    const install = await fetch(`${baseUrl}/api/skills/hello-world-skill/install?target=copilot-cli`).then((response) =>
      response.json(),
    );
    assert.equal(install.install.targetId, 'copilot-cli');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
