import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readCatalog, resolveRegistryDir } from '../../api/src/store.js';

export async function rebuildSearchIndex({ registryDir = resolveRegistryDir(process.cwd()) } = {}) {
  const catalog = await readCatalog(registryDir);
  const documents = catalog.skills.map((skill) => ({
    slug: skill.slug,
    tokens: [skill.slug, skill.name, skill.summary, ...(skill.tags ?? []), ...(skill.supportedTargets ?? [])]
      .join(' ')
      .toLowerCase(),
    supportedTargets: skill.supportedTargets,
    latestVersion: skill.latestVersion,
  }));
  const filePath = path.join(registryDir, 'search-index.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ documents }, null, 2)}\n`, 'utf8');
  return { documents };
}
