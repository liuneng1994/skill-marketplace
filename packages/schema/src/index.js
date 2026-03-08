import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';

export const manifestFileName = 'marketplace.skill.json';
export const supportedTargets = ['copilot-cli', 'claude-code'];
export const supportedInstallScopes = ['project', 'user', 'project-or-user'];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function ensureString(errors, label, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string.`);
  }
}

function ensureStringArray(errors, label, value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    errors.push(`${label} must be a non-empty array of strings.`);
  }
}

export function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) {
    return { ok: false, errors: ['Manifest must be a JSON object.'] };
  }

  ensureString(errors, 'slug', manifest.slug);
  ensureString(errors, 'name', manifest.name);
  ensureString(errors, 'summary', manifest.summary);
  ensureString(errors, 'version', manifest.version);
  ensureString(errors, 'license', manifest.license);
  ensureStringArray(errors, 'tags', manifest.tags);

  if (!isObject(manifest.publisher)) {
    errors.push('publisher must be an object.');
  } else {
    ensureString(errors, 'publisher.name', manifest.publisher.name);
    ensureString(errors, 'publisher.github', manifest.publisher.github);
  }

  if (!isObject(manifest.repository)) {
    errors.push('repository must be an object.');
  } else {
    ensureString(errors, 'repository.url', manifest.repository.url);
  }

  if (!isObject(manifest.targets)) {
    errors.push('targets must be an object keyed by target id.');
  } else {
    const targetIds = Object.keys(manifest.targets);
    if (targetIds.length === 0) {
      errors.push('targets must include at least one supported target.');
    }
    for (const targetId of targetIds) {
      if (!supportedTargets.includes(targetId)) {
        errors.push(`Unsupported target: ${targetId}.`);
        continue;
      }
      const descriptor = manifest.targets[targetId];
      if (!isObject(descriptor)) {
        errors.push(`targets.${targetId} must be an object.`);
        continue;
      }
      ensureString(errors, `targets.${targetId}.path`, descriptor.path);
      ensureString(errors, `targets.${targetId}.entrypoint`, descriptor.entrypoint);
      if (!isObject(descriptor.install)) {
        errors.push(`targets.${targetId}.install must be an object.`);
      } else if (!supportedInstallScopes.includes(descriptor.install.scope)) {
        errors.push(`targets.${targetId}.install.scope must be one of ${supportedInstallScopes.join(', ')}.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function readManifest(bundleDir) {
  const filePath = bundleDir instanceof URL ? new URL(manifestFileName, bundleDir) : path.join(bundleDir, manifestFileName);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function validateBundleDir(bundleDir) {
  const resolvedDir = bundleDir instanceof URL ? fileURLToPath(bundleDir) : path.resolve(bundleDir);
  const errors = [];
  const manifestPath = path.join(resolvedDir, manifestFileName);
  if (!(await pathExists(manifestPath))) {
    return { ok: false, errors: [`Missing ${manifestFileName} in bundle ${resolvedDir}.`] };
  }

  const manifest = await readManifest(resolvedDir);
  const manifestValidation = validateManifest(manifest);
  errors.push(...manifestValidation.errors);

  if (manifestValidation.ok) {
    for (const [targetId, descriptor] of Object.entries(manifest.targets)) {
      const targetDir = path.join(resolvedDir, descriptor.path);
      if (!(await pathExists(targetDir))) {
        errors.push(`targets.${targetId}.path does not exist: ${descriptor.path}`);
        continue;
      }
      const entrypoint = path.join(targetDir, descriptor.entrypoint);
      if (!(await pathExists(entrypoint))) {
        errors.push(`targets.${targetId}.entrypoint does not exist: ${descriptor.path}/${descriptor.entrypoint}`);
      }
      if (!(await pathExists(path.join(targetDir, 'SKILL.md')))) {
        errors.push(`targets.${targetId} must include SKILL.md inside ${descriptor.path}.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest,
  };
}
