import { resolveRegistryDir, listSkills, getInstallMetadata } from '../apps/api/src/store.js';
import { renderMarketplacePage, renderSkillDetailPage } from '../apps/web/src/index.js';
import { validateBundleDir } from '../packages/schema/src/index.js';

const rootDir = process.cwd();
const registryDir = resolveRegistryDir(rootDir);
const exampleBundle = `${rootDir}/examples/hello-world-skill`;

const validation = await validateBundleDir(exampleBundle);
if (!validation.ok) {
  throw new Error(`Example bundle is invalid:\n${validation.errors.join('\n')}`);
}

const skills = await listSkills({ registryDir });
if (skills.length === 0) {
  throw new Error('Registry is empty. Run `npm run seed` before build.');
}

const html = renderMarketplacePage({ skills, query: '', targetFilter: '' });
if (!html.includes('Skill Marketplace')) {
  throw new Error('Marketplace page render failed.');
}

const detail = renderSkillDetailPage({ skill: skills[0] });
if (!detail.includes(skills[0].name)) {
  throw new Error('Skill detail render failed.');
}

await getInstallMetadata({ registryDir, slug: skills[0].slug, targetId: skills[0].supportedTargets[0] });
console.log('build-ok');
