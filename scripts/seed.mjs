import path from 'node:path';
import { publishBundle, resolveRegistryDir } from '../apps/api/src/store.js';
import { rebuildSearchIndex } from '../apps/workers/src/index.js';

const rootDir = process.cwd();
const registryDir = resolveRegistryDir(rootDir);
const bundleDirs = [
  path.join(rootDir, 'examples', 'hello-world-skill'),
  path.join(rootDir, 'skills', 'self-improving-agent'),
];

for (const bundleDir of bundleDirs) {
  await publishBundle({ bundleDir, registryDir });
}
await rebuildSearchIndex({ registryDir });
console.log('seed-ok');
