import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';
import { createApiServer } from './server.js';
import { publishBundle } from './store.js';

const selfImprovingBundle = path.join(process.cwd(), 'skills', 'self-improving-agent');

test('createApiServer exposes health, listing, detail, and install endpoints', async () => {
  const registryDir = await mkdtemp(path.join(os.tmpdir(), 'skill-marketplace-api-'));
  await publishBundle({ bundleDir: selfImprovingBundle, registryDir, publishedAt: '2026-03-08T00:00:00.000Z' });

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
    assert.equal(listing.skills[0].features.memoryBootstrap, true);

    const detail = await fetch(`${baseUrl}/api/skills/self-improving-agent`).then((response) => response.json());
    assert.equal(detail.skill.slug, 'self-improving-agent');

    const install = await fetch(`${baseUrl}/api/skills/self-improving-agent/install?target=copilot-cli`).then((response) =>
      response.json(),
    );
    assert.equal(install.install.targetId, 'copilot-cli');
    assert.equal(install.install.features.memoryBootstrap, true);
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
