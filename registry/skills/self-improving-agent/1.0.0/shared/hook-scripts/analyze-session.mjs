import path from 'node:path';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const managedVersion = 1;
const analyzerLockTimeoutMs = 5_000;
const analyzerLockRetryMs = 100;

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readJson(filePath, fallback) {
  if (!(await pathExists(filePath))) {
    return fallback;
  }
  return safeJsonParse(await readFile(filePath, 'utf8'), fallback);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function bundleStateRootForMemory(memoryRoot) {
  return path.dirname(memoryRoot);
}

function managedRootForMemory(memoryRoot) {
  return path.join(bundleStateRootForMemory(memoryRoot), 'managed');
}

function semanticDirForMemory(memoryRoot) {
  return path.join(memoryRoot, 'semantic');
}

function sessionsDirForMemory(memoryRoot) {
  return path.join(memoryRoot, 'episodic', 'sessions');
}

function targetStorePath(memoryRoot, target) {
  return path.join(semanticDirForMemory(memoryRoot), 'targets', `${target}.json`);
}

function storePaths(memoryRoot) {
  return {
    sharedPatterns: path.join(semanticDirForMemory(memoryRoot), 'shared-patterns.json'),
    antiPatterns: path.join(semanticDirForMemory(memoryRoot), 'anti-patterns.json'),
    corrections: path.join(semanticDirForMemory(memoryRoot), 'corrections.json'),
  };
}

function managedPaths(memoryRoot, target) {
  const managedRoot = managedRootForMemory(memoryRoot);
  return {
    managedRoot,
    sharedContext: path.join(managedRoot, 'context', 'shared.md'),
    targetContext: path.join(managedRoot, 'context', `${target}.md`),
    sharedPatternTemplate: path.join(managedRoot, 'templates', 'shared', 'pattern-template.md'),
    sharedCorrectionTemplate: path.join(managedRoot, 'templates', 'shared', 'correction-template.md'),
    sharedValidationTemplate: path.join(managedRoot, 'templates', 'shared', 'validation-template.md'),
    targetInstruction: path.join(managedRoot, 'templates', target, 'instruction-overlay.md'),
  };
}

async function acquireAnalyzerLock(memoryRoot) {
  const lockDir = path.join(bundleStateRootForMemory(memoryRoot), 'locks', 'analyzer.lock');
  await mkdir(path.dirname(lockDir), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockDir);
      await writeJson(path.join(lockDir, 'owner.json'), {
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      });
      return { lockDir };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        if (Date.now() - startedAt >= analyzerLockTimeoutMs) {
          throw new Error(`Timed out waiting for analyzer lock at ${lockDir}.`);
        }
        await sleep(analyzerLockRetryMs);
        continue;
      }
      throw error;
    }
  }
}

async function releaseAnalyzerLock(lock) {
  if (!lock) {
    return;
  }
  await rm(lock.lockDir, { recursive: true, force: true });
}

function normalizeStore(store, field = 'patterns') {
  const collection = store && typeof store === 'object' && store[field] && typeof store[field] === 'object' ? store[field] : {};
  return {
    version: managedVersion,
    updatedAt: store?.updatedAt ?? null,
    [field]: collection,
  };
}

async function ensureManagedState(memoryRoot) {
  await mkdir(sessionsDirForMemory(memoryRoot), { recursive: true });
  await mkdir(path.join(semanticDirForMemory(memoryRoot), 'targets'), { recursive: true });
  await mkdir(path.join(managedRootForMemory(memoryRoot), 'context'), { recursive: true });
  await mkdir(path.join(managedRootForMemory(memoryRoot), 'templates', 'shared'), { recursive: true });
  await mkdir(path.join(managedRootForMemory(memoryRoot), 'templates', 'copilot-cli'), { recursive: true });
  await mkdir(path.join(managedRootForMemory(memoryRoot), 'templates', 'claude-code'), { recursive: true });

  const { sharedPatterns, antiPatterns, corrections } = storePaths(memoryRoot);
  if (!(await pathExists(sharedPatterns))) {
    const legacyPatterns = await readJson(path.join(memoryRoot, 'semantic-patterns.json'), { patterns: {} });
    await writeJson(sharedPatterns, normalizeStore({ patterns: legacyPatterns.patterns ?? {} }));
  }
  if (!(await pathExists(antiPatterns))) {
    await writeJson(antiPatterns, normalizeStore({ patterns: {} }));
  }
  if (!(await pathExists(corrections))) {
    await writeJson(corrections, normalizeStore({}, 'corrections'));
  }
  for (const target of ['copilot-cli', 'claude-code']) {
    const targetPath = targetStorePath(memoryRoot, target);
    if (!(await pathExists(targetPath))) {
      await writeJson(targetPath, normalizeStore({ patterns: {} }));
    }
  }
}

async function readCurrentSession(memoryRoot) {
  return readJson(path.join(memoryRoot, 'working', 'current_session.json'), { events: [] });
}

function extractToolName(event, fallbackTool = 'unknown') {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object') {
    return fallbackTool;
  }
  const candidates = [payload.toolName, payload.tool, payload.name, payload.matcher];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  if (event?.eventType === 'pre-tool' && Array.isArray(payload.args) && typeof payload.args[0] === 'string' && payload.args[0].trim() !== '') {
    return payload.args[0].trim();
  }
  if (event?.eventType === 'pre-tool' && typeof payload.raw === 'string' && payload.raw.trim() !== '') {
    return payload.raw.trim().slice(0, 80);
  }
  return fallbackTool;
}

function findExitCode(event) {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  for (const key of ['exitCode', 'exit_code', 'status']) {
    if (typeof payload[key] === 'number') {
      return payload[key];
    }
    if (typeof payload[key] === 'string' && payload[key].trim() !== '' && !Number.isNaN(Number(payload[key]))) {
      return Number(payload[key]);
    }
  }
  if (Array.isArray(payload.args) && payload.args.length >= 2) {
    const maybeCode = Number(payload.args[1]);
    if (!Number.isNaN(maybeCode)) {
      return maybeCode;
    }
  }
  return undefined;
}

function findOutputPreview(event) {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  for (const key of ['output', 'stderr', 'stdout', 'message']) {
    if (typeof payload[key] === 'string' && payload[key].trim() !== '') {
      return payload[key].trim().slice(0, 160);
    }
  }
  if (Array.isArray(payload.args) && typeof payload.args[0] === 'string') {
    return payload.args[0].trim().slice(0, 160);
  }
  if (typeof payload.raw === 'string') {
    return payload.raw.trim().slice(0, 160);
  }
  return undefined;
}

function summarizeSession(session, target) {
  const events = Array.isArray(session.events) ? session.events : [];
  const eventCounts = {};
  const toolCounts = {};
  const toolFailures = {};
  const errorSamples = [];
  let activeTool = 'unknown';

  for (const event of events) {
    const eventType = typeof event?.eventType === 'string' ? event.eventType : 'event';
    eventCounts[eventType] = (eventCounts[eventType] ?? 0) + 1;
    const toolName = extractToolName(event, activeTool);
    if (eventType === 'pre-tool' && toolName !== 'unknown') {
      activeTool = toolName;
    }
    if (toolName !== 'unknown' && (eventType === 'pre-tool' || eventType === 'post-tool' || eventType === 'error')) {
      toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
    }
    if (eventType === 'error' || (eventType === 'post-tool' && findExitCode(event) && findExitCode(event) !== 0)) {
      toolFailures[toolName] = (toolFailures[toolName] ?? 0) + 1;
      const preview = findOutputPreview(event);
      if (preview) {
        errorSamples.push(preview);
      }
    }
  }

  const sortedTools = Object.entries(toolCounts).sort((left, right) => right[1] - left[1]);
  const failedTools = Object.entries(toolFailures).sort((left, right) => right[1] - left[1]);
  return {
    target,
    eventCount: events.length,
    eventCounts,
    topTools: sortedTools.slice(0, 3).map(([tool, count]) => ({ tool, count })),
    failedTools: failedTools.map(([tool, count]) => ({ tool, count })),
    errorCount: eventCounts.error ?? 0,
    sessionStartedAt: session.sessionStartedAt ?? events[0]?.timestamp ?? null,
    sessionEndedAt: session.lastEventAt ?? events.at(-1)?.timestamp ?? new Date().toISOString(),
    lastPayload: session.lastPayload ?? {},
    errorSamples: errorSamples.slice(0, 3),
  };
}

function makeId(prefix, key) {
  return `${prefix}-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

function buildCandidates(summary) {
  const candidates = {
    sharedPatterns: [],
    sharedAntiPatterns: [],
    corrections: [],
    targetPatterns: [],
  };

  if (summary.eventCount >= 6) {
    candidates.sharedPatterns.push({
      key: 'iterative-validation-loop',
      title: 'Iterative validation loop',
      category: 'workflow',
      guidance: 'Break work into smaller steps and validate between tool actions instead of batching speculative changes.',
      evidence: `Observed ${summary.eventCount} tool events in one session.`,
      confidenceDelta: 0.08,
    });
  }

  if (summary.errorCount > 0) {
    candidates.sharedAntiPatterns.push({
      key: 'repeat-failure-without-inspection',
      title: 'Avoid repeating failures without inspection',
      category: 'failure-recovery',
      guidance: 'When a command or tool fails, inspect the output and adjust the approach before retrying the same action.',
      evidence: `Observed ${summary.errorCount} error events in the latest session.`,
      confidenceDelta: 0.12,
    });
    candidates.corrections.push({
      key: `correction-${summary.target}-latest-errors`,
      title: `Recent ${summary.target} error correction`,
      rootCause: summary.errorSamples[0] ?? 'Recent tool failures were recorded.',
      correctedGuidance: 'Inspect the failure output, narrow the next change, and validate before repeating the failing step.',
      followUpActions: [
        'Review the latest error sample before retrying.',
        'Prefer a smaller follow-up command or edit.',
        'Run a targeted validation step after the fix.',
      ],
      confidenceDelta: 0.1,
    });
  }

  if (summary.topTools.length > 0) {
    const primaryTool = summary.topTools[0];
    candidates.targetPatterns.push({
      key: `primary-tool-${summary.target}-${primaryTool.tool}`,
      title: `Primary ${summary.target} tool rhythm`,
      category: 'target-workflow',
      guidance: `Recent ${summary.target} sessions rely heavily on ${primaryTool.tool}; bias toward smaller, verifiable steps around that tool instead of large one-shot actions.`,
      evidence: `${primaryTool.tool} appeared ${primaryTool.count} times in the latest session.`,
      confidenceDelta: 0.07,
    });
  }

  if (summary.failedTools.length > 0) {
    const failedTool = summary.failedTools[0];
    candidates.targetPatterns.push({
      key: `stabilize-${summary.target}-${failedTool.tool}`,
      title: `Stabilize ${failedTool.tool} retries`,
      category: 'target-recovery',
      guidance: `For ${summary.target}, do not immediately repeat ${failedTool.tool} after a failure; first narrow the scope or inspect the produced output.`,
      evidence: `${failedTool.tool} produced ${failedTool.count} failure signals in the latest session.`,
      confidenceDelta: 0.09,
    });
  }

  return candidates;
}

function upsertLearningEntry(store, candidate, timestamp, { target } = {}) {
  const key = candidate.key;
  const existing = store[key];
  const nextConfidence = Math.min(0.99, Math.max(existing?.confidence ?? 0.45, (existing?.confidence ?? 0.45) + candidate.confidenceDelta));
  const occurrences = (existing?.occurrences ?? 0) + 1;
  const entry = {
    id: existing?.id ?? makeId(target ? `${target}-pat` : 'pat', key),
    key,
    title: candidate.title,
    category: candidate.category,
    guidance: candidate.guidance ?? existing?.guidance,
    evidence: candidate.evidence,
    target: target ?? existing?.target ?? null,
    confidence: Number(nextConfidence.toFixed(2)),
    occurrences,
    lastUpdatedAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
  };
  store[key] = entry;
  return entry;
}

function upsertCorrection(store, candidate, timestamp, target) {
  const key = candidate.key;
  const existing = store[key];
  const entry = {
    id: existing?.id ?? makeId(`${target}-correction`, key),
    key,
    title: candidate.title,
    target,
    rootCause: candidate.rootCause,
    correctedGuidance: candidate.correctedGuidance,
    followUpActions: candidate.followUpActions,
    confidence: Number(Math.min(0.99, Math.max(existing?.confidence ?? 0.4, (existing?.confidence ?? 0.4) + candidate.confidenceDelta)).toFixed(2)),
    occurrences: (existing?.occurrences ?? 0) + 1,
    lastUpdatedAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
  };
  store[key] = entry;
  return entry;
}

function sortEntries(values) {
  return [...values].sort((left, right) => {
    const confidenceDifference = (right.confidence ?? 0) - (left.confidence ?? 0);
    if (confidenceDifference !== 0) {
      return confidenceDifference;
    }
    return (right.occurrences ?? 0) - (left.occurrences ?? 0);
  });
}

function topEntries(store, limit = 5) {
  return sortEntries(Object.values(store)).slice(0, limit);
}

function renderManagedContext({ target, summary, sharedPatterns, targetPatterns, antiPatterns, corrections }) {
  const lines = [
    `# Self Improving Agent Context (${target})`,
    '',
    '## Latest session summary',
    `- Events: ${summary.eventCount}`,
    `- Errors: ${summary.errorCount}`,
    `- Top tools: ${summary.topTools.map((entry) => `${entry.tool} (${entry.count})`).join(', ') || 'none'}`,
    '',
    '## Shared patterns',
  ];

  for (const pattern of sharedPatterns) {
    lines.push(`- **${pattern.title}** (${pattern.confidence}) — ${pattern.guidance}`);
  }
  if (sharedPatterns.length === 0) {
    lines.push('- No shared patterns learned yet.');
  }

  lines.push('', `## ${target} overrides`);
  for (const pattern of targetPatterns) {
    lines.push(`- **${pattern.title}** (${pattern.confidence}) — ${pattern.guidance}`);
  }
  if (targetPatterns.length === 0) {
    lines.push(`- No ${target} overrides learned yet.`);
  }

  lines.push('', '## Anti-patterns');
  for (const antiPattern of antiPatterns) {
    lines.push(`- **${antiPattern.title}** (${antiPattern.confidence}) — ${antiPattern.guidance}`);
  }
  if (antiPatterns.length === 0) {
    lines.push('- No anti-patterns learned yet.');
  }

  lines.push('', '## Corrections');
  for (const correction of corrections) {
    lines.push(`- **${correction.title}** — ${correction.correctedGuidance}`);
  }
  if (corrections.length === 0) {
    lines.push('- No corrections recorded yet.');
  }

  return `${lines.join('\n')}\n`;
}

function appendLearnedSection(baseTemplate, title, items, formatter) {
  const lines = [baseTemplate.trimEnd(), '', `## ${title}`];
  if (items.length === 0) {
    lines.push('- No learned guidance yet.');
  } else {
    for (const item of items) {
      lines.push(formatter(item));
    }
  }
  return `${lines.join('\n')}\n`;
}

async function renderManagedTemplates({ memoryRoot, target, sharedPatterns, targetPatterns, antiPatterns, corrections }) {
  const templateRoot = new URL('../templates/', import.meta.url);
  const patternTemplate = await readFile(new URL('pattern-template.md', templateRoot), 'utf8');
  const correctionTemplate = await readFile(new URL('correction-template.md', templateRoot), 'utf8');
  const validationTemplate = await readFile(new URL('validation-template.md', templateRoot), 'utf8');
  const paths = managedPaths(memoryRoot, target);

  await writeFile(
    paths.sharedPatternTemplate,
    appendLearnedSection(patternTemplate, 'Auto-applied learned patterns', [...sharedPatterns, ...targetPatterns], (item) => {
      return `- **${item.title}** (${item.confidence}) — ${item.guidance}`;
    }),
    'utf8',
  );
  await writeFile(
    paths.sharedCorrectionTemplate,
    appendLearnedSection(correctionTemplate, 'Auto-applied corrections', corrections, (item) => {
      return `- **${item.title}** — ${item.correctedGuidance}`;
    }),
    'utf8',
  );
  await writeFile(
    paths.sharedValidationTemplate,
    appendLearnedSection(validationTemplate, 'Auto-applied validation rules', [...sharedPatterns, ...antiPatterns], (item) => {
      return `- [ ] ${item.guidance}`;
    }),
    'utf8',
  );

  const targetOverlay = [
    `# ${target} instruction overlay`,
    '',
    'Use these learned adjustments in addition to the base skill instructions:',
    ...targetPatterns.map((item) => `- ${item.guidance}`),
  ];
  if (targetPatterns.length === 0) {
    targetOverlay.push('- No target-specific overrides learned yet.');
  }
  await writeFile(paths.targetInstruction, `${targetOverlay.join('\n')}\n`, 'utf8');
  return paths;
}

async function writeSessionRecord(memoryRoot, summary, session) {
  const fileName = `${(summary.sessionEndedAt ?? new Date().toISOString()).replaceAll(':', '-').replaceAll('.', '-')}.json`;
  const filePath = path.join(sessionsDirForMemory(memoryRoot), fileName);
  await writeJson(filePath, {
    version: managedVersion,
    summary,
    session,
  });
  return filePath;
}

async function resetCurrentSession(memoryRoot, summary) {
  await writeJson(path.join(memoryRoot, 'working', 'current_session.json'), {
    events: [],
    lastCompletedSessionAt: summary.sessionEndedAt,
    previousTarget: summary.target,
  });
}

export async function analyzeAndApply({ memoryRoot, target, source = 'manual' }) {
  const lock = await acquireAnalyzerLock(memoryRoot);
  try {
    await ensureManagedState(memoryRoot);
    const session = await readCurrentSession(memoryRoot);
    const summary = summarizeSession(session, target);
    const timestamp = summary.sessionEndedAt ?? new Date().toISOString();
    const candidates = buildCandidates(summary);
    const paths = storePaths(memoryRoot);
    const sharedPatternsStore = normalizeStore(await readJson(paths.sharedPatterns, { patterns: {} }));
    const antiPatternsStore = normalizeStore(await readJson(paths.antiPatterns, { patterns: {} }));
    const correctionsStore = normalizeStore(await readJson(paths.corrections, { corrections: {} }), 'corrections');
    const targetStore = normalizeStore(await readJson(targetStorePath(memoryRoot, target), { patterns: {} }));

    const applied = {
      sharedPatterns: [],
      antiPatterns: [],
      corrections: [],
      targetPatterns: [],
    };

    for (const candidate of candidates.sharedPatterns) {
      applied.sharedPatterns.push(upsertLearningEntry(sharedPatternsStore.patterns, candidate, timestamp));
    }
    for (const candidate of candidates.sharedAntiPatterns) {
      applied.antiPatterns.push(upsertLearningEntry(antiPatternsStore.patterns, candidate, timestamp));
    }
    for (const candidate of candidates.corrections) {
      applied.corrections.push(upsertCorrection(correctionsStore.corrections, candidate, timestamp, target));
    }
    for (const candidate of candidates.targetPatterns) {
      applied.targetPatterns.push(upsertLearningEntry(targetStore.patterns, candidate, timestamp, { target }));
    }

    sharedPatternsStore.updatedAt = timestamp;
    antiPatternsStore.updatedAt = timestamp;
    correctionsStore.updatedAt = timestamp;
    targetStore.updatedAt = timestamp;

    await writeJson(paths.sharedPatterns, sharedPatternsStore);
    await writeJson(paths.antiPatterns, antiPatternsStore);
    await writeJson(paths.corrections, correctionsStore);
    await writeJson(targetStorePath(memoryRoot, target), targetStore);

    const sessionRecordPath = await writeSessionRecord(memoryRoot, summary, session);
    const sharedTop = topEntries(sharedPatternsStore.patterns);
    const antiTop = topEntries(antiPatternsStore.patterns);
    const targetTop = topEntries(targetStore.patterns);
    const correctionTop = topEntries(correctionsStore.corrections);
    const contextPaths = managedPaths(memoryRoot, target);

    await writeFile(
      contextPaths.sharedContext,
      renderManagedContext({
        target: 'shared',
        summary,
        sharedPatterns: sharedTop,
        targetPatterns: [],
        antiPatterns: antiTop,
        corrections: correctionTop,
      }),
      'utf8',
    );
    await writeFile(
      contextPaths.targetContext,
      renderManagedContext({
        target,
        summary,
        sharedPatterns: sharedTop,
        targetPatterns: targetTop,
        antiPatterns: antiTop,
        corrections: correctionTop,
      }),
      'utf8',
    );
    const managedTemplatePaths = await renderManagedTemplates({
      memoryRoot,
      target,
      sharedPatterns: sharedTop,
      targetPatterns: targetTop,
      antiPatterns: antiTop,
      corrections: correctionTop,
    });

    const lastAnalysis = {
      version: managedVersion,
      source,
      target,
      analyzedAt: new Date().toISOString(),
      summary,
      sessionRecordPath,
      applied,
      managed: {
        sharedContext: contextPaths.sharedContext,
        targetContext: contextPaths.targetContext,
        templates: managedTemplatePaths,
      },
    };
    await writeJson(path.join(memoryRoot, 'working', 'last_analysis.json'), lastAnalysis);
    await resetCurrentSession(memoryRoot, summary);
    return lastAnalysis;
  } finally {
    await releaseAnalyzerLock(lock);
  }
}

export async function inspectLearning({ memoryRoot, target }) {
  await ensureManagedState(memoryRoot);
  const paths = storePaths(memoryRoot);
  const sharedPatternsStore = normalizeStore(await readJson(paths.sharedPatterns, { patterns: {} }));
  const antiPatternsStore = normalizeStore(await readJson(paths.antiPatterns, { patterns: {} }));
  const correctionsStore = normalizeStore(await readJson(paths.corrections, { corrections: {} }), 'corrections');
  const targetStore = normalizeStore(await readJson(targetStorePath(memoryRoot, target), { patterns: {} }));
  const lastAnalysis = await readJson(path.join(memoryRoot, 'working', 'last_analysis.json'), null);
  const sessionFiles = await readdir(sessionsDirForMemory(memoryRoot)).catch(() => []);
  return {
    target,
    lastAnalysis,
    sessionCount: sessionFiles.length,
    sharedPatterns: topEntries(sharedPatternsStore.patterns, 10),
    antiPatterns: topEntries(antiPatternsStore.patterns, 10),
    corrections: topEntries(correctionsStore.corrections, 10),
    targetPatterns: topEntries(targetStore.patterns, 10),
    managed: managedPaths(memoryRoot, target),
  };
}

export async function resetLearning({ memoryRoot, target }) {
  const lock = await acquireAnalyzerLock(memoryRoot);
  try {
    await ensureManagedState(memoryRoot);
    await rm(sessionsDirForMemory(memoryRoot), { recursive: true, force: true });
    await rm(path.join(semanticDirForMemory(memoryRoot), 'shared-patterns.json'), { force: true });
    await rm(path.join(semanticDirForMemory(memoryRoot), 'anti-patterns.json'), { force: true });
    await rm(path.join(semanticDirForMemory(memoryRoot), 'corrections.json'), { force: true });
    await rm(targetStorePath(memoryRoot, target), { force: true });
    await rm(managedRootForMemory(memoryRoot), { recursive: true, force: true });
    await rm(path.join(memoryRoot, 'working', 'last_analysis.json'), { force: true });
    await ensureManagedState(memoryRoot);
    return inspectLearning({ memoryRoot, target });
  } finally {
    await releaseAnalyzerLock(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [memoryRoot = '.', target = 'unknown', source = 'manual'] = process.argv.slice(2);
  const result = await analyzeAndApply({ memoryRoot, target, source });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
