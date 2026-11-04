import { createFrontDeskServer } from './front-desk-server.mjs';
import { loadFrontDeskRecordings } from './front-desk-recordings.mjs';
import { DEFAULT_CORRECTION_FILE } from './front-desk-corrections.mjs';

const port = Number(process.env.FRONT_DESK_PORT || 4330);
try {
  const recordings = await loadFrontDeskRecordings();
  const server = createFrontDeskServer({ port, correctionFile: process.env.FRONT_DESK_CORRECTIONS_FILE || DEFAULT_CORRECTION_FILE, ...recordings });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'The local front-desk port is already in use.' : 'The local front-desk server could not start.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Action Shift: http://127.0.0.1:${port}/front-desk\nReviewed recorded Muse results; fictional restaurant and kitchen simulation. No new API request or external action.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
} catch {
  console.error('The reviewed recordings, local correction state or server configuration could not be loaded. Startup stopped; no corrections or recordings were discarded.');
  process.exitCode = 1;
}
