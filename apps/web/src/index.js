function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderBadges(skill) {
  const badges = [...skill.supportedTargets.map((target) => ({ label: target, variant: 'target' }))];
  if (skill.features?.memoryBootstrap) {
    badges.push({ label: 'memory bootstrap', variant: 'feature' });
  }
  for (const hookTarget of skill.features?.hookTargets ?? []) {
    badges.push({ label: `hooks:${hookTarget}`, variant: 'feature' });
  }
  return badges
    .map((badge) => `<span class="badge ${badge.variant}">${escapeHtml(badge.label)}</span>`)
    .join('');
}

function getDefaultTarget(skill) {
  if (skill.supportedTargets.includes('copilot-cli')) {
    return 'copilot-cli';
  }
  return skill.supportedTargets[0] ?? 'copilot-cli';
}

function renderRegistryInstallCommands(skill) {
  return skill.supportedTargets
    .map((target) => `<li><code>node marketplace.mjs install ${escapeHtml(skill.slug)} --target ${escapeHtml(target)} --scope project</code></li>`)
    .join('');
}

function buildRepositoryCommands(skill) {
  const defaultTarget = getDefaultTarget(skill);
  const commands = [
    {
      id: 'remote-default-command',
      title: 'Recommended: install from the repository URL',
      text: `node marketplace.mjs install ${skill.slug} ${skill.repository.url} --scope project`,
      buttonLabel: 'Copy recommended command',
      featured: true,
      note: 'Use this when the repository is not cloned yet.',
    },
    {
      id: 'local-default-command',
      title: 'Already in the repository? Use the local command',
      text: `node marketplace.mjs install ${skill.slug} --scope project`,
      buttonLabel: 'Copy local command',
      note: 'Run this inside an existing checkout that already contains the skill bundle.',
    },
  ];

  for (const target of skill.supportedTargets) {
    if (target === defaultTarget) {
      continue;
    }
    commands.push({
      id: `remote-${target}-command`,
      title: `Need ${target} instead?`,
      text: `node marketplace.mjs install ${skill.slug} ${skill.repository.url} --target ${target} --scope project`,
      buttonLabel: `Copy ${target} command`,
      note: `The default target is ${defaultTarget}; use this override when ${target} is required.`,
    });
  }

  return commands;
}

function buildPromptTemplate(skill) {
  const defaultTarget = getDefaultTarget(skill);
  const lines = [
    `Install the ${skill.slug} skill from ${skill.repository.url} with Skill Marketplace in this workspace.`,
    '',
    'Preferred command when the repository is not cloned yet:',
    `node marketplace.mjs install ${skill.slug} ${skill.repository.url} --scope project`,
    '',
    'If the repository is already cloned and this terminal is inside that repository, run:',
    `node marketplace.mjs install ${skill.slug} --scope project`,
  ];

  if (skill.supportedTargets.length > 1) {
    const alternateTargets = skill.supportedTargets.filter((target) => target !== defaultTarget);
    if (alternateTargets.length > 0) {
      lines.push('', `Default target: ${defaultTarget}.`);
      for (const target of alternateTargets) {
        lines.push(`If ${target} is required, add: --target ${target}`);
      }
    }
  }

  return lines.join('\n');
}

function renderCopyableSnippet({ id, title, text, buttonLabel, note, featured = false }) {
  return `<div class="copy-snippet${featured ? ' featured-snippet' : ''}">
    <div class="snippet-header">
      <h3>${escapeHtml(title)}</h3>
      <button type="button" class="copy-button" data-copy-target="${escapeHtml(id)}" data-copy-label="${escapeHtml(buttonLabel)}">${escapeHtml(buttonLabel)}</button>
    </div>
    ${note ? `<p class="snippet-note">${escapeHtml(note)}</p>` : ''}
    <pre><code id="${escapeHtml(id)}">${escapeHtml(text)}</code></pre>
  </div>`;
}

function renderFeatureSummary(skill) {
  const parts = [];
  if (skill.features?.memoryBootstrap) {
    parts.push('memory bootstrap');
  }
  if ((skill.features?.hookTargets ?? []).length > 0) {
    parts.push(`hook templates: ${skill.features.hookTargets.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' • ') : 'portable skill payload only';
}

function renderCopyScript() {
  return `<script>
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-target]');
      if (!button) {
        return;
      }
      const target = document.getElementById(button.getAttribute('data-copy-target'));
      if (!target) {
        return;
      }
      const defaultLabel = button.getAttribute('data-copy-label') || 'Copy';
      try {
        await navigator.clipboard.writeText(target.textContent || '');
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      window.setTimeout(() => {
        button.textContent = defaultLabel;
      }, 1600);
    });
  </script>`;
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
        <div class="badges">${renderBadges(skill)}</div>
        <p class="meta">Tags: ${escapeHtml(skill.tags.join(', '))}</p>
        <p class="meta">Features: ${escapeHtml(renderFeatureSummary(skill))}</p>
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
      .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; margin-right: 8px; margin-bottom: 8px; font-size: 0.85rem; }
      .badge.target { background: #1d4ed8; }
      .badge.feature { background: #047857; }
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
  const repositoryCommands = buildRepositoryCommands(skill)
    .map((command) => renderCopyableSnippet(command))
    .join('');
  const promptTemplate = renderCopyableSnippet({
    id: 'model-install-prompt',
    title: 'Send this to your coding model',
    text: buildPromptTemplate(skill),
    buttonLabel: 'Copy prompt for model',
    note: 'Paste this into Copilot, Claude, or another coding model when you want it to run the install flow for you.',
    featured: true,
  });

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
      pre { background: #020617; border: 1px solid #334155; border-radius: 12px; padding: 14px; overflow-x: auto; white-space: pre-wrap; }
      .meta { color: #94a3b8; }
      .install-steps { margin: 0 0 0 20px; color: #cbd5e1; }
      .install-steps li + li { margin-top: 8px; }
      .copy-snippet + .copy-snippet { margin-top: 16px; }
      .featured-snippet { border: 1px solid #2563eb; border-radius: 14px; padding: 16px; background: #0b1220; }
      .snippet-header { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
      .snippet-header h3 { margin: 0; font-size: 1rem; }
      .snippet-note { margin: 0 0 12px; color: #cbd5e1; }
      .copy-button { border-radius: 10px; border: 1px solid #475569; padding: 8px 12px; background: #2563eb; color: inherit; cursor: pointer; }
      .eyebrow { display: inline-block; margin-bottom: 10px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #93c5fd; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">← Back to marketplace</a></p>
      <section class="panel">
        <h1>${escapeHtml(skill.name)}</h1>
        <p>${escapeHtml(skill.summary)}</p>
        <div>${renderBadges(skill)}</div>
        <p>Latest version: <code>${escapeHtml(skill.latestVersion)}</code></p>
        <p>Publisher: ${escapeHtml(skill.publisher.name)} (${escapeHtml(skill.publisher.github)})</p>
        <p>Repository: <a href="${escapeHtml(skill.repository.url)}">${escapeHtml(skill.repository.url)}</a></p>
        <p class="meta">Feature summary: ${escapeHtml(renderFeatureSummary(skill))}</p>
      </section>
      <section class="panel">
        <span class="eyebrow">Fastest path</span>
        <h2>Install from repository</h2>
        <ol class="install-steps">
          <li>Copy the recommended command if you want to install directly from the repository URL.</li>
          <li>Use the local command instead when you are already inside the repository checkout.</li>
          <li>Copy the model prompt if you want Copilot or another coding model to run the install flow for you.</li>
        </ol>
        <div style="margin-top: 16px;">${repositoryCommands}</div>
      </section>
      <section class="panel">
        <span class="eyebrow">Model-friendly</span>
        <h2>One-click prompt</h2>
        ${promptTemplate}
      </section>
      <section class="panel">
        <h2>Registry install commands</h2>
        <ul>${renderRegistryInstallCommands(skill)}</ul>
        <p>Skills with hook templates will also generate helper files under <code>.skill-marketplace/</code> during installation.</p>
      </section>
      <section class="panel">
        <h2>Versions</h2>
        <ul>${skill.versions
          .map((version) => `<li><code>${escapeHtml(version.version)}</code> — ${escapeHtml(version.publishedAt)}</li>`)
          .join('')}</ul>
      </section>
    </main>
    ${renderCopyScript()}
  </body>
</html>`;
}
