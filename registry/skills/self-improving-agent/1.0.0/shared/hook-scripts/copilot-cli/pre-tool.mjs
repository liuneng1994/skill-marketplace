import { recordEvent } from '../record-event.mjs';
const memoryRoot = process.env.SIA_MEMORY_ROOT;
if (!memoryRoot) throw new Error('SIA_MEMORY_ROOT is required');
const raw = await new Response(process.stdin).text();
const payload = raw ? JSON.parse(raw) : {};
await recordEvent({ eventType: 'pre-tool', memoryRoot, target: 'copilot-cli', payload });
