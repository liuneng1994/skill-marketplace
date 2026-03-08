import http from 'node:http';
import path from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { getInstallMetadata, getSkill, listSkills, publishBundle, resolveRegistryDir } from './store.js';
import { rebuildSearchIndex } from '../../workers/src/index.js';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createApiServer({ registryDir = resolveRegistryDir(process.cwd()) } = {}) {
  return http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        sendJson(response, 400, { error: 'Missing request URL.' });
        return;
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = url.pathname;

      if (request.method === 'GET' && pathname === '/health') {
        sendJson(response, 200, { ok: true, registryDir });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/skills') {
        const skills = await listSkills({
          registryDir,
          target: url.searchParams.get('target') ?? undefined,
          query: url.searchParams.get('q') ?? undefined,
        });
        sendJson(response, 200, { skills });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/publish') {
        const body = await readJsonBody(request);
        if (typeof body.bundleDir !== 'string' || body.bundleDir.trim() === '') {
          sendJson(response, 400, { error: 'bundleDir must be a non-empty string.' });
          return;
        }
        const published = await publishBundle({ bundleDir: path.resolve(body.bundleDir), registryDir });
        await rebuildSearchIndex({ registryDir });
        sendJson(response, 201, { skill: published });
        return;
      }

      const skillMatch = pathname.match(/^\/api\/skills\/([^/]+)$/u);
      if (request.method === 'GET' && skillMatch) {
        const slug = decodeURIComponent(skillMatch[1]);
        const skill = await getSkill({ registryDir, slug });
        if (!skill) {
          sendJson(response, 404, { error: `Skill not found: ${slug}` });
          return;
        }
        sendJson(response, 200, { skill });
        return;
      }

      const installMatch = pathname.match(/^\/api\/skills\/([^/]+)\/install$/u);
      if (request.method === 'GET' && installMatch) {
        const slug = decodeURIComponent(installMatch[1]);
        const targetId = url.searchParams.get('target');
        if (!targetId) {
          sendJson(response, 400, { error: 'target query parameter is required.' });
          return;
        }
        const metadata = await getInstallMetadata({
          registryDir,
          slug,
          targetId,
          version: url.searchParams.get('version') ?? undefined,
        });
        sendJson(response, 200, { install: metadata });
        return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unknown error.' });
    }
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  const registryDir = resolveRegistryDir(process.cwd());
  const server = createApiServer({ registryDir });
  server.listen(port, () => {
    console.log(`Skill marketplace API listening on http://127.0.0.1:${port}`);
  });
}
