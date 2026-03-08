import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { analyzeAndApply, inspectLearning, resetLearning } from './analyze-session.mjs';
import { recordEvent } from './record-event.mjs';

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
  });

  assert.equal(analysis.summary.errorCount, 1);
  assert.ok(analysis.applied.sharedPatterns.length >= 0);
  assert.ok(analysis.applied.antiPatterns.length >= 1);
  assert.ok(analysis.applied.targetPatterns.length >= 1);

  const inspect = await inspectLearning({ memoryRoot, target: 'claude-code' });
  assert.ok(inspect.sharedPatterns.length >= 1);
  assert.ok(inspect.antiPatterns.length >= 1);
  assert.ok(inspect.targetPatterns.length >= 1);

  const sharedContext = await readFile(inspect.managed.sharedContext, 'utf8');
  assert.match(sharedContext, /Shared patterns/);
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
  });

  const resetState = await resetLearning({ memoryRoot, target: 'copilot-cli' });
  assert.equal(resetState.sessionCount, 0);
  assert.equal(resetState.targetPatterns.length, 0);
  assert.equal(resetState.antiPatterns.length, 0);
});
