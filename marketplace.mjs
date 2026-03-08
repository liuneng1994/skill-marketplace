#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { publishBundle, listSkills, getSkill, getInstallMetadata, resolveRegistryDir } from './apps/api/src/store.js';
import { rebuildSearchIndex } from './apps/workers/src/index.js';
import { installSkillFromBundle, uninstallSkill } from './packages/installer/src/index.js';

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { positional, options };
}

function printUsage() {
  console.log(`Usage:
  node marketplace.mjs list [--target <target>] [--registry <dir>]
  node marketplace.mjs show <slug> [--registry <dir>]
  node marketplace.mjs publish <bundleDir> [--registry <dir>]
  node marketplace.mjs install <slug> --target <target> [--version <version>] [--client-version <version>] [--scope project|user] [--workspace <dir>] [--home <dir>] [--registry <dir>] [--force]
  node marketplace.mjs uninstall <slug> --target <target> [--client-version <version>] [--scope project|user] [--workspace <dir>] [--home <dir>] [--force]`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    printUsage();
    return;
  }

  const { positional, options } = parseArgs(rest);
  const registryDir = options.registry ? path.resolve(options.registry) : resolveRegistryDir(process.cwd());

  if (command === 'list') {
    const skills = await listSkills({ registryDir, target: typeof options.target === 'string' ? options.target : undefined });
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  if (command === 'show') {
    const slug = positional[0];
    if (!slug) {
      throw new Error('show requires a <slug> argument');
    }
    const skill = await getSkill({ registryDir, slug });
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    console.log(JSON.stringify(skill, null, 2));
    return;
  }

  if (command === 'publish') {
    const bundleDir = positional[0];
    if (!bundleDir) {
      throw new Error('publish requires a <bundleDir> argument');
    }
    const published = await publishBundle({ bundleDir: path.resolve(bundleDir), registryDir });
    await rebuildSearchIndex({ registryDir });
    console.log(JSON.stringify(published, null, 2));
    return;
  }

  if (command === 'install') {
    const slug = positional[0];
    if (!slug) {
      throw new Error('install requires a <slug> argument');
    }
    if (typeof options.target !== 'string') {
      throw new Error('install requires --target <copilot-cli|claude-code>');
    }
    const metadata = await getInstallMetadata({
      registryDir,
      slug,
      targetId: options.target,
      version: typeof options.version === 'string' ? options.version : undefined,
    });
    const result = await installSkillFromBundle({
      bundleDir: metadata.bundleDir,
      targetId: options.target,
      scope: typeof options.scope === 'string' ? options.scope : 'project',
      workspaceDir: typeof options.workspace === 'string' ? path.resolve(options.workspace) : process.cwd(),
      homeDir: typeof options.home === 'string' ? path.resolve(options.home) : os.homedir(),
      force: Boolean(options.force),
      clientVersion: typeof options['client-version'] === 'string' ? options['client-version'] : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'uninstall') {
    const slug = positional[0];
    if (!slug) {
      throw new Error('uninstall requires a <slug> argument');
    }
    if (typeof options.target !== 'string') {
      throw new Error('uninstall requires --target <copilot-cli|claude-code>');
    }
    const result = await uninstallSkill({
      slug,
      targetId: options.target,
      scope: typeof options.scope === 'string' ? options.scope : 'project',
      workspaceDir: typeof options.workspace === 'string' ? path.resolve(options.workspace) : process.cwd(),
      homeDir: typeof options.home === 'string' ? path.resolve(options.home) : os.homedir(),
      force: Boolean(options.force),
      clientVersion: typeof options['client-version'] === 'string' ? options['client-version'] : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
