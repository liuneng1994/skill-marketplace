import path from 'node:path';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

export async function recordEvent({ eventType, memoryRoot, target, payload }) {
  await ensureMemoryRoots(memoryRoot);
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
