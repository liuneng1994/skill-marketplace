import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { summarizeManifestFeatures, validateBundleDir, validateManifest } from './index.js';

const helloWorldBundle = path.join(process.cwd(), 'examples', 'hello-world-skill');
const selfImprovingBundle = path.join(process.cwd(), 'skills', 'self-improving-agent');

test('validateManifest accepts the example manifest shape', () => {
  const manifest = {
    slug: 'demo-skill',
    name: 'Demo Skill',
    summary: 'Example summary',
    version: '1.0.0',
    license: 'MIT',
    tags: ['demo'],
    publisher: { name: 'Example', github: 'example' },
    repository: { url: 'https://github.com/example/demo' },
    targets: {
      'copilot-cli': {
        path: 'targets/copilot-cli',
        entrypoint: 'SKILL.md',
        install: { scope: 'project-or-user' }
      }
    }
  };
  assert.equal(validateManifest(manifest).ok, true);
});

test('summarizeManifestFeatures reports bootstrap and hook support', () => {
  const features = summarizeManifestFeatures({
    shared: { path: 'shared' },
    bootstrap: {
      memory: { path: 'shared/bootstrap/memory' },
      hooks: {
        'copilot-cli': { template: 'a.md', scripts: 'b', strategy: 'snippet' },
        'claude-code': { template: 'c.md', scripts: 'd', strategy: 'snippet' }
      }
    }
  });
  assert.deepEqual(features, {
    hasSharedAssets: true,
    memoryBootstrap: true,
    hookTargets: ['copilot-cli', 'claude-code']
  });
});

test('validateBundleDir rejects missing entrypoints', async () => {
  const bundleDir = await mkdtemp(path.join(os.tmpdir(), 'invalid-skill-bundle-'));
  await mkdir(path.join(bundleDir, 'targets', 'copilot-cli'), { recursive: true });
  await writeFile(
    path.join(bundleDir, 'marketplace.skill.json'),
    JSON.stringify(
      {
        slug: 'broken-skill',
        name: 'Broken Skill',
        summary: 'Broken',
        version: '1.0.0',
        license: 'MIT',
        tags: ['broken'],
        publisher: { name: 'Example', github: 'example' },
        repository: { url: 'https://github.com/example/broken' },
        targets: {
          'copilot-cli': {
            path: 'targets/copilot-cli',
            entrypoint: 'SKILL.md',
            install: { scope: 'project' }
          }
        }
      },
      null,
      2,
    ),
  );

  const validation = await validateBundleDir(bundleDir);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /entrypoint does not exist/);
});

test('validateBundleDir accepts the hello-world example bundle', async () => {
  const validation = await validateBundleDir(helloWorldBundle);
  assert.equal(validation.ok, true);
  assert.equal(validation.manifest.slug, 'hello-world-skill');
});

test('validateBundleDir accepts the self-improving-agent bundle', async () => {
  const validation = await validateBundleDir(selfImprovingBundle);
  assert.equal(validation.ok, true);
  assert.equal(validation.manifest.slug, 'self-improving-agent');
  assert.equal(validation.manifest.bootstrap.hooks['copilot-cli'].strategy, 'snippet');
});
