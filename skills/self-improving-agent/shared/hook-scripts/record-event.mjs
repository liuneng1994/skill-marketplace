import path from 'node:path';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const defaultRetention = {
  maxBytes: 128 * 1024,
  maxArchives: 5,
};

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeRetention(retention = {}) {
  return {
    maxBytes: Number.isInteger(retention.maxBytes) && retention.maxBytes > 0 ? retention.maxBytes : defaultRetention.maxBytes,
    maxArchives: Number.isInteger(retention.maxArchives) && retention.maxArchives >= 0 ? retention.maxArchives : defaultRetention.maxArchives,
  };
}

async function ensureMemoryRoots(memoryRoot) {
  await mkdir(path.join(memoryRoot, 'semantic'), { recursive: true });
  await mkdir(path.join(memoryRoot, 'episodic'), { recursive: true });
  await mkdir(path.join(memoryRoot, 'working'), { recursive: true });
}

async function readCurrentSession(memoryRoot) {
  const filePath = path.join(memoryRoot, 'working', 'current_session.json');
  if (!(await pathExists(filePath))) {
    return { events: [] };
  }
  return safeJsonParse(await readFile(filePath, 'utf8'), { events: [] });
}

async function writeCurrentSession(memoryRoot, session) {
  const filePath = path.join(memoryRoot, 'working', 'current_session.json');
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

async function rotateEventLog(memoryRoot, retention) {
  const eventsPath = path.join(memoryRoot, 'working', 'events.jsonl');
  if (!(await pathExists(eventsPath))) {
    return [];
  }

  const currentStats = await stat(eventsPath);
  if (currentStats.size < retention.maxBytes) {
    return [];
  }

  const archiveName = `events-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.jsonl`;
  const archivePath = path.join(memoryRoot, 'working', archiveName);
  await rename(eventsPath, archivePath);

  const entries = await readdir(path.join(memoryRoot, 'working'), { withFileTypes: true });
  const archives = entries
    .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const keptArchives = archives.slice(0, retention.maxArchives);
  for (const archive of archives.slice(retention.maxArchives)) {
    await rm(path.join(memoryRoot, 'working', archive), { force: true });
  }
  return keptArchives;
}

async function pruneRotatedArchives(memoryRoot, retention) {
  const workingDir = path.join(memoryRoot, 'working');
  const entries = await readdir(workingDir, { withFileTypes: true });
  const archives = entries
    .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const keptArchives = archives.slice(0, retention.maxArchives);
  for (const archive of archives.slice(retention.maxArchives)) {
    await rm(path.join(workingDir, archive), { force: true });
  }
  return keptArchives;
}

async function writeRetentionSummary(memoryRoot, retention, rotatedFiles) {
  const eventsPath = path.join(memoryRoot, 'working', 'events.jsonl');
  const activeSizeBytes = (await pathExists(eventsPath)) ? (await stat(eventsPath)).size : 0;
  await writeFile(
    path.join(memoryRoot, 'working', 'retention.json'),
    `${JSON.stringify(
      {
        activeFile: 'events.jsonl',
        activeSizeBytes,
        maxBytes: retention.maxBytes,
        maxArchives: retention.maxArchives,
        rotatedFiles,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export async function recordEvent({ eventType, memoryRoot, target, payload, retention }) {
  await ensureMemoryRoots(memoryRoot);
  const resolvedRetention = normalizeRetention(retention);
  const rotatedFilesBeforeWrite = await rotateEventLog(memoryRoot, resolvedRetention);
  const timestamp = new Date().toISOString();
  const event = { eventType, target, timestamp, payload };
  await appendFile(path.join(memoryRoot, 'working', 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');

  const session = await readCurrentSession(memoryRoot);
  session.target = target;
  session.lastEventAt = timestamp;
  session.events = [...(session.events ?? []), { eventType, timestamp }].slice(-25);
  session.lastPayload = payload;
  await writeCurrentSession(memoryRoot, session);

  if (eventType === 'error') {
    await writeFile(path.join(memoryRoot, 'working', 'last_error.json'), `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  }

  if (eventType === 'session-end') {
    await writeFile(path.join(memoryRoot, 'working', 'session_end.json'), `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  }

  const rotatedFiles = rotatedFilesBeforeWrite.length > 0 ? rotatedFilesBeforeWrite : await pruneRotatedArchives(memoryRoot, resolvedRetention);
  await writeRetentionSummary(memoryRoot, resolvedRetention, rotatedFiles);

  return event;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [eventType = 'event', memoryRoot = '.', target = 'unknown', ...rest] = process.argv.slice(2);
  const payload =
    rest.length === 0
      ? {}
      : rest.length === 1
        ? safeJsonParse(rest[0], { raw: rest[0] })
        : { args: rest };
  await recordEvent({ eventType, memoryRoot, target, payload });
}
