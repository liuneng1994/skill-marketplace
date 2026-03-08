import http from 'node:http';
import { URL, pathToFileURL } from 'node:url';
import { getSkill, listSkills, resolveRegistryDir } from '../../api/src/store.js';
import { renderMarketplacePage, renderSkillDetailPage } from './index.js';

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

function sendNotFound(response) {
  sendHtml(response, 404, '<h1>Not found</h1>');
}

export function createWebServer({ registryDir = resolveRegistryDir(process.cwd()) } = {}) {
  return http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        sendNotFound(response);
        return;
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/') {
        const skills = await listSkills({
          registryDir,
          target: url.searchParams.get('target') ?? undefined,
          query: url.searchParams.get('q') ?? undefined,
        });
        sendHtml(
          response,
          200,
          renderMarketplacePage({
            skills,
            query: url.searchParams.get('q') ?? '',
            targetFilter: url.searchParams.get('target') ?? '',
          }),
        );
        return;
      }

      const detailMatch = url.pathname.match(/^\/skills\/([^/]+)$/u);
      if (detailMatch) {
        const skill = await getSkill({ registryDir, slug: decodeURIComponent(detailMatch[1]) });
        if (!skill) {
          sendNotFound(response);
          return;
        }
        sendHtml(response, 200, renderSkillDetailPage({ skill }));
        return;
      }

      sendNotFound(response);
    } catch (error) {
      sendHtml(response, 500, `<pre>${error instanceof Error ? error.message : 'Unknown error'}</pre>`);
    }
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const server = createWebServer({ registryDir: resolveRegistryDir(process.cwd()) });
  server.listen(port, () => {
    console.log(`Skill marketplace web listening on http://127.0.0.1:${port}`);
  });
}
