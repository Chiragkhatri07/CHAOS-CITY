import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io as createClient } from 'socket.io-client';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForState(client, predicate, timeoutMs = 4000, label = 'expected state') {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for synchronized game state: ${label}.`)); }, timeoutMs);
    const onState = state => { if (predicate(state)) { cleanup(); resolve(state); } };
    const cleanup = () => { clearTimeout(timeout); client.off('state', onState); };
    client.on('state', onState);
  });
}

async function connectClient(port) {
  const client = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, timeout: 4000 });
  await once(client, 'connect');
  return client;
}

test('Socket.IO rooms sync players, validate actions, transfer host, and restore a reconnecting player', { timeout: 20000 }, async t => {
  const port = 32000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), CLIENT_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let startupOutput = '';
  server.stdout.setEncoding('utf8').on('data', value => { startupOutput += value; });
  server.stderr.setEncoding('utf8').on('data', value => { startupOutput += value; });
  const clients = [];
  t.after(() => {
    for (const client of clients) client.disconnect();
    server.kill();
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { ready = true; break; } } catch { /* server is starting */ }
    await wait(100);
  }
  assert.equal(ready, true, `server should start and expose health endpoint (${startupOutput})`);

  const host = await connectClient(port); clients.push(host);
  const hostSession = new Promise(resolve => host.once('session', resolve));
  const hostInitialState = new Promise(resolve => host.once('state', resolve));
  host.emit('createRoom', { name: 'Mayor Fox' });
  const credentials = await hostSession;
  const hostState = await hostInitialState;
  assert.equal(hostState.phase, 'lobby');

  const guest = await connectClient(port); clients.push(guest);
  const guestSession = new Promise(resolve => guest.once('session', resolve));
  const guestState = waitForState(guest, state => state.players?.length === 2, 4000, 'guest sees both lobby players');
  const hostSeesGuest = waitForState(host, state => state.players?.length === 2, 4000, 'host sees guest');
  guest.emit('joinRoom', { code: credentials.code.toLowerCase(), name: 'Mayor Frog' });
  const guestCredentials = await guestSession;
  await Promise.all([guestState, hostSeesGuest]);

  const duplicateNameClient = await connectClient(port); clients.push(duplicateNameClient);
  const duplicateError = new Promise(resolve => duplicateNameClient.once('errorMessage', resolve));
  duplicateNameClient.emit('joinRoom', { code: credentials.code, name: 'Mayor Fox' });
  assert.match((await duplicateError).message, /already in the room/);

  const fullStatePromise = waitForState(host, state => state.players?.length === 8, 4000, 'room fills to eight players');
  for (let i = 2; i < 8; i++) {
    const next = await connectClient(port); clients.push(next);
    const joined = new Promise(resolve => next.once('session', resolve));
    next.emit('joinRoom', { code: credentials.code, name: `City Guest ${i}` });
    await joined;
  }
  const fullState = await fullStatePromise;
  assert.equal(fullState.players.length, 8);

  const fullRoomClient = await connectClient(port); clients.push(fullRoomClient);
  const fullError = new Promise(resolve => fullRoomClient.once('errorMessage', resolve));
  fullRoomClient.emit('joinRoom', { code: credentials.code, name: 'One Too Many' });
  assert.match((await fullError).message, /room is full/);
  await wait(400);
  const invalidCodeError = new Promise(resolve => fullRoomClient.once('errorMessage', resolve));
  fullRoomClient.emit('joinRoom', { code: 'ZZZZZ', name: 'Lost Player' });
  assert.match((await invalidCodeError).message, /Room not found/);

  const hostSeesGame = waitForState(host, state => state.phase === 'playing', 4000, 'host sees playing phase');
  const guestSeesGame = waitForState(guest, state => state.phase === 'playing', 4000, 'guest sees playing phase');
  host.emit('startGame');
  await Promise.all([hostSeesGame, guestSeesGame]);

  const invalidAction = new Promise(resolve => guest.once('errorMessage', resolve));
  guest.emit('action', { action: 'set-money', data: { value: 999999 } });
  assert.match((await invalidAction).message, /not recognized/);
  await wait(400);

  const hostSeesEarnings = waitForState(host, state => state.players.find(p => p.id === guestCredentials.playerId)?.money > 1000, 4000, 'earn action synchronized to host');
  guest.emit('action', { action: 'earn', data: {} });
  await hostSeesEarnings;

  const guestSeesNewHost = waitForState(guest, state => state.hostId === guestCredentials.playerId && state.players.find(p => p.id === credentials.playerId)?.online === false, 4000, 'host reassigned on disconnect');
  host.disconnect();
  await guestSeesNewHost;

  const reconnected = await connectClient(port); clients.push(reconnected);
  const reconnectSession = new Promise(resolve => reconnected.once('session', resolve));
  const restoredState = waitForState(reconnected, state => state.players.find(p => p.id === credentials.playerId)?.online === true, 4000, 'disconnected player is online after reconnect');
  reconnected.emit('reconnectRoom', credentials);
  await reconnectSession;
  await restoredState;
});
