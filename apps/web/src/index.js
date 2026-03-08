function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTargetBadges(targets) {
  return targets
    .map((target) => `<span class="badge">${escapeHtml(target)}</span>`)
    .join('');
}

function renderInstallCommands(skill) {
  return skill.supportedTargets
    .map(
      (target) => `<li><code>node marketplace.mjs install ${escapeHtml(skill.slug)} --target ${escapeHtml(target)} --scope project</code></li>`,
    )
    .join('');
}

export function renderMarketplacePage({ skills, query = '', targetFilter = '' }) {
  const cards = skills
    .map(
      (skill) => `<article class="card">
        <div class="card-header">
          <h2><a href="/skills/${encodeURIComponent(skill.slug)}">${escapeHtml(skill.name)}</a></h2>
          <span class="version">v${escapeHtml(skill.latestVersion)}</span>
        </div>
        <p>${escapeHtml(skill.summary)}</p>
        <div class="badges">${renderTargetBadges(skill.supportedTargets)}</div>
        <p class="meta">Tags: ${escapeHtml(skill.tags.join(', '))}</p>
        <p class="meta">Publisher: ${escapeHtml(skill.publisher.name)} (${escapeHtml(skill.publisher.github)})</p>
      </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Skill Marketplace</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
      h1, h2 { margin-bottom: 8px; }
      a { color: #93c5fd; text-decoration: none; }
      .hero, .card { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
      .badge { display: inline-block; background: #1d4ed8; padding: 4px 10px; border-radius: 999px; margin-right: 8px; margin-bottom: 8px; font-size: 0.85rem; }
      .meta, .version { color: #94a3b8; }
      form { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
      input, select, button { border-radius: 10px; border: 1px solid #475569; padding: 10px 12px; background: #020617; color: inherit; }
      button { background: #2563eb; cursor: pointer; }
      .card-header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Skill Marketplace</h1>
        <p>Publish and install skills for GitHub Copilot CLI and Claude Code from one registry.</p>
        <form method="GET" action="/">
          <input type="text" name="q" value="${escapeHtml(query)}" placeholder="Search skills" />
          <select name="target">
            <option value=""${targetFilter === '' ? ' selected' : ''}>All targets</option>
            <option value="copilot-cli"${targetFilter === 'copilot-cli' ? ' selected' : ''}>copilot-cli</option>
            <option value="claude-code"${targetFilter === 'claude-code' ? ' selected' : ''}>claude-code</option>
          </select>
          <button type="submit">Search</button>
        </form>
      </section>
      ${cards || '<section class="card"><p>No skills found.</p></section>'}
    </main>
  </body>
</html>`;
}

export function renderSkillDetailPage({ skill }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(skill.name)} | Skill Marketplace</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
      a { color: #93c5fd; text-decoration: none; }
      .panel { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
      .badge { display: inline-block; background: #1d4ed8; padding: 4px 10px; border-radius: 999px; margin-right: 8px; margin-bottom: 8px; font-size: 0.85rem; }
      code { background: #020617; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">← Back to marketplace</a></p>
      <section class="panel">
        <h1>${escapeHtml(skill.name)}</h1>
        <p>${escapeHtml(skill.summary)}</p>
        <div>${renderTargetBadges(skill.supportedTargets)}</div>
        <p>Latest version: <code>${escapeHtml(skill.latestVersion)}</code></p>
        <p>Publisher: ${escapeHtml(skill.publisher.name)} (${escapeHtml(skill.publisher.github)})</p>
        <p>Repository: <a href="${escapeHtml(skill.repository.url)}">${escapeHtml(skill.repository.url)}</a></p>
      </section>
      <section class="panel">
        <h2>Install commands</h2>
        <ul>${renderInstallCommands(skill)}</ul>
      </section>
      <section class="panel">
        <h2>Versions</h2>
        <ul>${skill.versions
          .map((version) => `<li><code>${escapeHtml(version.version)}</code> — ${escapeHtml(version.publishedAt)}</li>`)
          .join('')}</ul>
      </section>
    </main>
  </body>
</html>`;
}
