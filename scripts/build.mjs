import path from 'node:path';
import { resolveRegistryDir, listSkills, getInstallMetadata } from '../apps/api/src/store.js';
import { renderMarketplacePage, renderSkillDetailPage } from '../apps/web/src/index.js';
import { validateBundleDir } from '../packages/schema/src/index.js';

const rootDir = process.cwd();
const registryDir = resolveRegistryDir(rootDir);
const bundles = [
  path.join(rootDir, 'examples', 'hello-world-skill'),
  path.join(rootDir, 'skills', 'self-improving-agent'),
];

for (const bundleDir of bundles) {
  const validation = await validateBundleDir(bundleDir);
  if (!validation.ok) {
    throw new Error(`Bundle is invalid (${bundleDir}):\n${validation.errors.join('\n')}`);
  }
}

const skills = await listSkills({ registryDir });
if (skills.length < 2) {
  throw new Error('Registry should contain both example and self-improving-agent bundles. Run `npm run seed` before build.');
}

const html = renderMarketplacePage({ skills, query: '', targetFilter: '' });
if (!html.includes('Self Improving Agent')) {
  throw new Error('Marketplace page should render the self-improving-agent listing.');
}

const selfImprovingAgent = skills.find((skill) => skill.slug === 'self-improving-agent');
if (!selfImprovingAgent) {
  throw new Error('self-improving-agent listing missing from registry output.');
}

const detail = renderSkillDetailPage({ skill: selfImprovingAgent });
if (!detail.includes('hook templates')) {
  throw new Error('Skill detail page should render hook bootstrap information.');
}
if (!detail.includes('Install from repository')) {
  throw new Error('Skill detail page should render repository install templates.');
}
if (!detail.includes('Copy prompt for model')) {
  throw new Error('Skill detail page should render a copyable prompt template.');
}
if (!detail.includes('Copy recommended command')) {
  throw new Error('Skill detail page should highlight the recommended install command.');
}

await getInstallMetadata({ registryDir, slug: 'self-improving-agent', targetId: 'claude-code' });
console.log('build-ok');
