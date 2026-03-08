import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeAndApply, inspectLearning, resetLearning } from './analyze-session.mjs';
import { recordEvent } from './record-event.mjs';

const managedVersion = 1;

async function writeStore(filePath, field, entries) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const collection = Object.fromEntries(entries.map((entry) => [entry.key, entry]));
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        version: managedVersion,
        updatedAt: new Date().toISOString(),
        [field]: collection,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function makePattern(key, index, guidance) {
  return {
    id: `pat-${key}`,
    key,
    title: `Learned pattern ${index}`,
    category: 'workflow',
    guidance,
    confidence: Number((0.95 - index * 0.01).toFixed(2)),
    occurrences: 8 - (index % 3),
    lastUpdatedAt: new Date(Date.now() - index * 1_000).toISOString(),
    createdAt: new Date(Date.now() - (index + 1) * 2_000).toISOString(),
  };
}

function makeCorrection(key, index, guidance, target = 'claude-code') {
  return {
    id: `cor-${key}`,
    key,
    title: `Correction ${index}`,
    target,
    rootCause: `failure-${index}`,
    correctedGuidance: guidance,
    followUpActions: ['Inspect output', 'Reduce scope', 'Validate again'],
    confidence: Number((0.9 - index * 0.01).toFixed(2)),
    occurrences: 6 - (index % 2),
    lastUpdatedAt: new Date(Date.now() - index * 1_500).toISOString(),
    createdAt: new Date(Date.now() - (index + 1) * 3_000).toISOString(),
  };
}

async function seedLargeLearnedMemory(memoryRoot) {
  const verboseGuidance =
    'Prefer short validated steps, inspect failures before retrying, and keep edits narrow so the next validation run stays easy to explain and reverse if needed.';
  await writeStore(
    path.join(memoryRoot, 'semantic', 'shared-patterns.json'),
    'patterns',
    Array.from({ length: 7 }, (_, index) => makePattern(`shared-${index}`, index, `${verboseGuidance} Shared pattern ${index}.`)),
  );
  await writeStore(
    path.join(memoryRoot, 'semantic', 'anti-patterns.json'),
    'patterns',
    Array.from({ length: 4 }, (_, index) => makePattern(`anti-${index}`, index, `${verboseGuidance} Anti-pattern ${index}.`)),
  );
  await writeStore(
    path.join(memoryRoot, 'semantic', 'corrections.json'),
    'corrections',
    Array.from({ length: 4 }, (_, index) => makeCorrection(`correction-${index}`, index, `${verboseGuidance} Correction ${index}.`, index % 2 === 0 ? 'claude-code' : 'copilot-cli')),
  );
}

async function withGlobalSummaryBudget({ soft, hard }, run) {
  const previousSoft = process.env.SIA_GLOBAL_SUMMARY_SOFT_LIMIT;
  const previousHard = process.env.SIA_GLOBAL_SUMMARY_HARD_LIMIT;
  process.env.SIA_GLOBAL_SUMMARY_SOFT_LIMIT = String(soft);
  process.env.SIA_GLOBAL_SUMMARY_HARD_LIMIT = String(hard);
  try {
    await run();
  } finally {
    if (previousSoft === undefined) {
      delete process.env.SIA_GLOBAL_SUMMARY_SOFT_LIMIT;
    } else {
      process.env.SIA_GLOBAL_SUMMARY_SOFT_LIMIT = previousSoft;
    }
    if (previousHard === undefined) {
      delete process.env.SIA_GLOBAL_SUMMARY_HARD_LIMIT;
    } else {
      process.env.SIA_GLOBAL_SUMMARY_HARD_LIMIT = previousHard;
    }
  }
}

function globalStateRootFor(memoryRoot) {
  return path.join(memoryRoot, 'user-state');
}

test('analyzeAndApply converts recorded events into learned memory and managed overlays', async () => {
  const memoryRoot = await mkdtemp(path.join(os.tmpdir(), 'sia-analyze-'));

  await recordEvent({
    eventType: 'pre-tool',
    memoryRoot,
    target: 'claude-code',
    payload: { args: ['Bash', 'npm test'] },
  });
  await recordEvent({
    eventType: 'post-tool',
    memoryRoot,
    target: 'claude-code',
    payload: { args: ['test failure output', '1'] },
  });
  await recordEvent({
    eventType: 'error',
    memoryRoot,
    target: 'claude-code',
    payload: { args: ['test failure output', '1'] },
  });
  await recordEvent({
    eventType: 'pre-tool',
    memoryRoot,
    target: 'claude-code',
    payload: { args: ['Edit', 'fix bug'] },
  });
  await recordEvent({
    eventType: 'post-tool',
    memoryRoot,
    target: 'claude-code',
    payload: { args: ['edit applied', '0'] },
  });
  await recordEvent({
    eventType: 'session-end',
    memoryRoot,
    target: 'claude-code',
    payload: { reason: 'manual' },
  });

  const analysis = await analyzeAndApply({
    memoryRoot,
    target: 'claude-code',
    source: 'test',
    globalStateRoot: globalStateRootFor(memoryRoot),
  });

  assert.equal(analysis.summary.errorCount, 1);
  assert.ok(analysis.applied.sharedPatterns.length >= 0);
  assert.ok(analysis.applied.antiPatterns.length >= 1);
  assert.ok(analysis.applied.targetPatterns.length >= 1);

  const inspect = await inspectLearning({ memoryRoot, target: 'claude-code', globalStateRoot: globalStateRootFor(memoryRoot) });
  assert.ok(inspect.sharedPatterns.length >= 1);
  assert.ok(inspect.antiPatterns.length >= 1);
  assert.ok(inspect.targetPatterns.length >= 1);
  assert.equal(inspect.globalSummary.budget.compressionApplied, false);
  assert.match(inspect.globalSummary.summaryPath, /user-state/);

  const sharedContext = await readFile(inspect.managed.sharedContext, 'utf8');
  assert.match(sharedContext, /Global Summary/);
  assert.match(sharedContext, /Watch-outs/);
  const targetContext = await readFile(inspect.managed.targetContext, 'utf8');
  assert.match(targetContext, /claude-code overrides/);
  const targetOverlay = await readFile(inspect.managed.targetInstruction, 'utf8');
  assert.match(targetOverlay, /instruction overlay/);

  const sessionFiles = await readdir(path.join(memoryRoot, 'episodic', 'sessions'));
  assert.equal(sessionFiles.length, 1);

  const currentSession = JSON.parse(await readFile(path.join(memoryRoot, 'working', 'current_session.json'), 'utf8'));
  assert.deepEqual(currentSession.events, []);
});

test('resetLearning clears managed learning state and recreates empty stores', async () => {
  const memoryRoot = await mkdtemp(path.join(os.tmpdir(), 'sia-reset-'));
  await recordEvent({
    eventType: 'session-end',
    memoryRoot,
    target: 'copilot-cli',
    payload: { toolName: 'Bash' },
  });
  await analyzeAndApply({
    memoryRoot,
    target: 'copilot-cli',
    source: 'test',
    globalStateRoot: globalStateRootFor(memoryRoot),
  });

  const resetState = await resetLearning({ memoryRoot, target: 'copilot-cli', globalStateRoot: globalStateRootFor(memoryRoot) });
  assert.equal(resetState.sessionCount, 0);
  assert.equal(resetState.targetPatterns.length, 0);
  assert.equal(resetState.antiPatterns.length, 0);
  assert.equal(resetState.globalSummary.budget.mode, 'empty');
});

test('analyzeAndApply auto-compresses the global summary on soft budget overflow and records cleanup metadata', async () => {
  await withGlobalSummaryBudget({ soft: 50, hard: 160 }, async () => {
    const memoryRoot = await mkdtemp(path.join(os.tmpdir(), 'sia-summary-soft-'));
    await seedLargeLearnedMemory(memoryRoot);
    await recordEvent({
      eventType: 'session-end',
      memoryRoot,
      target: 'claude-code',
      payload: { reason: 'manual' },
    });

    const analysis = await analyzeAndApply({
      memoryRoot,
      target: 'claude-code',
      source: 'test',
      globalStateRoot: globalStateRootFor(memoryRoot),
    });

    assert.equal(analysis.globalSummary.budget.softExceeded, true);
    assert.equal(analysis.globalSummary.budget.compressionApplied, true);
    assert.equal(analysis.globalSummary.budget.mode, 'compact');
    assert.ok(analysis.globalSummary.budget.estimatedTokens <= analysis.globalSummary.budget.hardLimitTokens);
    assert.ok(analysis.globalSummary.dropped.length >= 1);
    assert.ok(analysis.globalSummary.cleanupRecommendations.length >= 1);

    const inspect = await inspectLearning({ memoryRoot, target: 'claude-code', globalStateRoot: globalStateRootFor(memoryRoot) });
    const sharedContext = await readFile(inspect.managed.sharedContext, 'utf8');
    assert.match(sharedContext, /Summary maintenance/);
    assert.match(sharedContext, /Auto-compressed/);
    assert.ok(inspect.globalSummary.selectedCounts.sharedPatterns < inspect.globalSummary.sourceCounts.sharedPatterns);
  });
});

test('analyzeAndApply hard-caps the global summary when the compressed summary still exceeds the hard budget', async () => {
  await withGlobalSummaryBudget({ soft: 18, hard: 24 }, async () => {
    const memoryRoot = await mkdtemp(path.join(os.tmpdir(), 'sia-summary-hard-'));
    await seedLargeLearnedMemory(memoryRoot);
    await recordEvent({
      eventType: 'session-end',
      memoryRoot,
      target: 'copilot-cli',
      payload: { reason: 'manual' },
    });

    const analysis = await analyzeAndApply({
      memoryRoot,
      target: 'copilot-cli',
      source: 'test',
      globalStateRoot: globalStateRootFor(memoryRoot),
    });

    assert.equal(analysis.globalSummary.budget.mode, 'hard-cap');
    assert.equal(analysis.globalSummary.budget.hardExceeded, true);
    assert.ok(analysis.globalSummary.budget.estimatedTokens <= analysis.globalSummary.budget.hardLimitTokens);
    assert.ok(analysis.globalSummary.cleanupRecommendations.some((entry) => /hard budget/i.test(entry)));

    const sharedContext = await readFile(analysis.managed.sharedContext, 'utf8');
    assert.match(sharedContext, /Hard-capped/);
    assert.doesNotMatch(sharedContext, /Recent corrections/);
  });
});
