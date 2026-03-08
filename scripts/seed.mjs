import path from 'node:path';
import { publishBundle, resolveRegistryDir } from '../apps/api/src/store.js';
import { rebuildSearchIndex } from '../apps/workers/src/index.js';

const rootDir = process.cwd();
const registryDir = resolveRegistryDir(rootDir);
const bundleDir = path.join(rootDir, 'examples', 'hello-world-skill');

await publishBundle({ bundleDir, registryDir });
await rebuildSearchIndex({ registryDir });
console.log('seed-ok');
