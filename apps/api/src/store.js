import crypto from 'node:crypto';
import path from 'node:path';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { manifestFileName, validateBundleDir } from '../../../packages/schema/src/index.js';

const CATALOG_FILE = 'catalog.json';

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  if (!(await pathExists(filePath))) {
    return fallback;
  }
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function listFilesRecursive(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(rootDir, absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath));
    }
  }
  return sortStrings(files);
}

async function computeDirectoryDigest(rootDir) {
  const digest = crypto.createHash('sha256');
  const files = await listFilesRecursive(rootDir);
  for (const relativePath of files) {
    digest.update(relativePath);
    digest.update(await readFile(path.join(rootDir, relativePath)));
  }
  return digest.digest('hex');
}

export function resolveRegistryDir(rootDir = process.cwd()) {
  return path.join(rootDir, 'registry');
}

export async function ensureRegistry(registryDir) {
  await mkdir(path.join(registryDir, 'skills'), { recursive: true });
  if (!(await pathExists(path.join(registryDir, CATALOG_FILE)))) {
    await writeJson(path.join(registryDir, CATALOG_FILE), { skills: [] });
  }
}

export async function readCatalog(registryDir) {
  await ensureRegistry(registryDir);
  return readJson(path.join(registryDir, CATALOG_FILE), { skills: [] });
}

async function writeCatalog(registryDir, catalog) {
  await writeJson(path.join(registryDir, CATALOG_FILE), catalog);
}

function summarizeSkill(skill) {
  return {
    slug: skill.slug,
    name: skill.name,
    summary: skill.summary,
    latestVersion: skill.latestVersion,
    supportedTargets: skill.supportedTargets,
    tags: skill.tags,
    publisher: skill.publisher,
    license: skill.license,
    repository: skill.repository,
    versions: skill.versions.map((version) => ({
      version: version.version,
      publishedAt: version.publishedAt,
      checksum: version.checksum,
      supportedTargets: version.supportedTargets,
    })),
  };
}

function buildVersionRecord(manifest, publishedAt, checksum) {
  const supportedTargets = Object.keys(manifest.targets);
  return {
    version: manifest.version,
    publishedAt,
    checksum,
    manifestFile: manifestFileName,
    supportedTargets,
    targets: supportedTargets.reduce((accumulator, targetId) => {
      const descriptor = manifest.targets[targetId];
      accumulator[targetId] = {
        path: descriptor.path,
        entrypoint: descriptor.entrypoint,
        install: descriptor.install,
        compatibility: descriptor.compatibility ?? {},
      };
      return accumulator;
    }, {}),
  };
}

export async function publishBundle({ bundleDir, registryDir, publishedAt = new Date().toISOString() }) {
  const validation = await validateBundleDir(bundleDir);
  if (!validation.ok) {
    throw new Error(`Bundle validation failed:\n${validation.errors.join('\n')}`);
  }

  const manifest = validation.manifest;
  await ensureRegistry(registryDir);

  const versionDir = path.join(registryDir, 'skills', manifest.slug, manifest.version);
  await rm(versionDir, { recursive: true, force: true });
  await mkdir(path.dirname(versionDir), { recursive: true });
  await cp(bundleDir, versionDir, { recursive: true });

  const checksum = await computeDirectoryDigest(versionDir);
  const catalog = await readCatalog(registryDir);
  const nextVersion = buildVersionRecord(manifest, publishedAt, checksum);
  const existingIndex = catalog.skills.findIndex((skill) => skill.slug === manifest.slug);
  const skillRecord = {
    slug: manifest.slug,
    name: manifest.name,
    summary: manifest.summary,
    latestVersion: manifest.version,
    supportedTargets: Object.keys(manifest.targets),
    tags: manifest.tags,
    publisher: manifest.publisher,
    license: manifest.license,
    repository: manifest.repository,
    versions: [nextVersion],
  };

  if (existingIndex >= 0) {
    const existing = catalog.skills[existingIndex];
    const remainingVersions = existing.versions.filter((version) => version.version !== manifest.version);
    catalog.skills[existingIndex] = {
      ...existing,
      ...skillRecord,
      versions: sortStrings([...remainingVersions.map((version) => version.version), manifest.version]).map(
        (versionNumber) => (versionNumber === manifest.version ? nextVersion : remainingVersions.find((entry) => entry.version === versionNumber)),
      ),
    };
  } else {
    catalog.skills.push(skillRecord);
  }

  catalog.skills = catalog.skills
    .map((skill) => ({
      ...skill,
      versions: skill.versions.filter(Boolean),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  await writeCatalog(registryDir, catalog);
  return summarizeSkill(catalog.skills.find((skill) => skill.slug === manifest.slug));
}

export async function listSkills({ registryDir, target, query } = {}) {
  const catalog = await readCatalog(registryDir);
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
  return catalog.skills
    .filter((skill) => !target || skill.supportedTargets.includes(target))
    .filter((skill) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [skill.slug, skill.name, skill.summary, ...(skill.tags ?? []), ...(skill.supportedTargets ?? [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .map(summarizeSkill);
}

export async function getSkill({ registryDir, slug }) {
  const catalog = await readCatalog(registryDir);
  const skill = catalog.skills.find((entry) => entry.slug === slug);
  return skill ? summarizeSkill(skill) : null;
}

export async function getInstallMetadata({ registryDir, slug, targetId, version }) {
  const catalog = await readCatalog(registryDir);
  const skill = catalog.skills.find((entry) => entry.slug === slug);
  if (!skill) {
    throw new Error(`Skill not found: ${slug}`);
  }
  const chosenVersion = version
    ? skill.versions.find((entry) => entry.version === version)
    : skill.versions.find((entry) => entry.version === skill.latestVersion) ?? skill.versions.at(-1);
  if (!chosenVersion) {
    throw new Error(`No version available for skill: ${slug}`);
  }
  if (!chosenVersion.supportedTargets.includes(targetId)) {
    throw new Error(`Target ${targetId} is not published for ${slug}@${chosenVersion.version}`);
  }
  return {
    slug: skill.slug,
    name: skill.name,
    summary: skill.summary,
    targetId,
    version: chosenVersion.version,
    checksum: chosenVersion.checksum,
    descriptor: chosenVersion.targets[targetId],
    bundleDir: path.join(registryDir, 'skills', skill.slug, chosenVersion.version),
  };
}
