import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { recordEvent } from './record-event.mjs';

test('recordEvent rotates logs and writes retention metadata', async () => {
  const memoryRoot = await mkdtemp(path.join(os.tmpdir(), 'sia-memory-'));

  for (let index = 0; index < 6; index += 1) {
    await recordEvent({
      eventType: 'post-tool',
      memoryRoot,
      target: 'claude-code',
      payload: {
        index,
        message: 'x'.repeat(120),
      },
      retention: {
        maxBytes: 180,
        maxArchives: 2,
      },
    });
  }

  const workingDir = path.join(memoryRoot, 'working');
  const files = await readdir(workingDir);
  const archiveFiles = files.filter((fileName) => fileName.startsWith('events-') && fileName.endsWith('.jsonl'));
  assert.ok(archiveFiles.length >= 1);
  assert.ok(archiveFiles.length <= 2);

  const retention = JSON.parse(await readFile(path.join(workingDir, 'retention.json'), 'utf8'));
  assert.equal(retention.maxBytes, 180);
  assert.equal(retention.maxArchives, 2);
  assert.ok(retention.rotatedFiles.length >= 1);
  assert.ok(retention.rotatedFiles.length <= 2);

  const session = JSON.parse(await readFile(path.join(workingDir, 'current_session.json'), 'utf8'));
  assert.ok(session.events.length <= 25);
  assert.equal(session.target, 'claude-code');
});
