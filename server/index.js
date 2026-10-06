import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { RoomStore } from './room-store.js';
import { createRoom, cleanName, doAction, finishIfExpired, makeCode, nextEvent, PROPERTIES, publicState, respondTrade, resolveEvent, startGame, makeTrade } from './game.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  path: process.env.VERCEL ? '/api/socket-io' : '/socket.io',
  cors: CLIENT_ORIGIN ? { origin: CLIENT_ORIGIN.split(',').map(x => x.trim()), methods: ['GET', 'POST'] } : false,
  maxHttpBufferSize: 1e5,
  pingInterval: 25000,
  pingTimeout: 20000
});
const actionTimes = new Map();
const redisUnavailable = Boolean(process.env.VERCEL && !process.env.REDIS_URL);
let redisClient = null;
let store = new RoomStore();

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', error => console.error('Redis connection error:', error.message));
  const subscriber = redisClient.duplicate();
  subscriber.on('error', error => console.error('Redis subscriber error:', error.message));
  await Promise.all([redisClient.connect(), subscriber.connect()]);
  io.adapter(createAdapter(redisClient, subscriber));
  store = new RoomStore(redisClient);
}

function notice(room, message, kind = 'info') { io.to(room.code).emit('notice', { message, kind }); }
function fail(socket, error) { socket.emit('errorMessage', { message: error?.message ?? 'Something went wrong.' }); }
async function sendState(room) {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit('state', publicState(room, player.id));
  }
}
function throttle(socket, key, cooldown = 350) {
  const id = `${socket.id}:${key}`; const now = Date.now();
  if ((actionTimes.get(id) ?? 0) > now - cooldown) throw new Error('One moment! Your last action is still processing.');
  actionTimes.set(id, now);
}
function locatePlayer(room, socket) {
  const player = room.players.find(p => p.id === socket.data.playerId);
  if (!player || player.socketId !== socket.id) throw new Error('Your room session has expired. Join the room again.');
  return player;
}
function attachSocket(socket, room, player) {
  socket.data.playerId = player.id;
  socket.data.roomCode = room.code;
  socket.join(room.code);
  room.lastActivity = Date.now();
}

if (redisUnavailable) {
  io.use((_socket, next) => next(new Error('The city server is waiting for its Redis connection.')));
}

io.on('connection', socket => {
  socket.emit('connected', { id: socket.id });

  socket.on('createRoom', async (payload = {}) => {
    try {
      throttle(socket, 'create');
      const name = cleanName(payload.name);
      let room;
      for (let attempt = 0; attempt < 8; attempt++) {
        room = createRoom(name);
        room.players[0].socketId = socket.id;
        if (await store.create(room)) break;
        room = null;
      }
      if (!room) throw new Error('Could not create a room. Please try again.');
      const player = room.players[0];
      attachSocket(socket, room, player);
      socket.emit('session', { code: room.code, playerId: player.id, token: player.token });
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('joinRoom', async (payload = {}) => {
    try {
      throttle(socket, 'join');
      const code = String(payload.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const name = cleanName(payload.name);
      const result = await store.mutate(code, room => {
        if (room.phase !== 'lobby') throw new Error('This game has already started.');
        if (room.players.length >= 8) throw new Error('This room is full.');
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already in the room. Try another.');
        const token = randomUUID();
        const player = { ...createRoom(name).players[0], id: randomUUID(), token, socketId: socket.id };
        room.players.push(player);
        room.lastActivity = Date.now();
        return { room, player };
      });
      const { room, player } = result;
      attachSocket(socket, room, player);
      socket.emit('session', { code: room.code, playerId: player.id, token: player.token });
      notice(room, `${player.name} just rolled into town.`, 'success');
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('reconnectRoom', async (payload = {}) => {
    try {
      throttle(socket, 'reconnect');
      const code = String(payload.code ?? '').toUpperCase();
      const result = await store.mutate(code, room => {
        const player = room.players.find(p => p.id === payload.playerId && p.token === payload.token);
        if (!player) throw new Error('Could not restore that room session.');
        const previousSocketId = player.socketId;
        player.online = true;
        player.socketId = socket.id;
        room.lastActivity = Date.now();
        return { room, player, previousSocketId };
      });
      const { room, player, previousSocketId } = result;
      if (previousSocketId && previousSocketId !== socket.id) io.to(previousSocketId).disconnectSockets(true);
      attachSocket(socket, room, player);
      socket.emit('session', { code: room.code, playerId: player.id, token: player.token });
      notice(room, `${player.name} is back in the city.`, 'success');
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('startGame', async () => {
    try {
      throttle(socket, 'start');
      const room = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        if (player.id !== room.hostId) throw new Error('Only the host can start the game.');
        startGame(room); room.lastActivity = Date.now(); return room;
      });
      notice(room, 'The city is yours. Make it count!', 'success');
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('rematch', async () => {
    try {
      throttle(socket, 'rematch');
      const room = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        if (player.id !== room.hostId) throw new Error('Only the host can start a rematch.');
        if (room.phase !== 'results') throw new Error('The current game is still in progress.');
        room.phase = 'lobby'; room.event = null; room.trade = null; room.startedAt = null; room.endsAt = null; room.round = 0; room.lastEventAt = null; room.history = [];
        room.properties = PROPERTIES.map(p => ({ ...p, ownerId: null }));
        for (const p of room.players) Object.assign(p, { money: 1000, reputation: 50, energy: 100, score: 0, earned: 0, spent: 0, eventsWon: 0, actions: 0, investigated: false, cooldowns: {} });
        room.lastActivity = Date.now(); return room;
      });
      await sendState(room); notice(room, 'New game, fresh chaos. Waiting for the host!', 'success');
    } catch (error) { fail(socket, error); }
  });

  socket.on('action', async payload => {
    try {
      throttle(socket, 'action');
      const room = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        doAction(room, player.id, payload?.action, payload?.data); room.lastActivity = Date.now(); return room;
      });
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('eventChoice', async payload => {
    try {
      throttle(socket, 'event');
      const room = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        resolveEvent(room, player.id, payload?.choice); room.lastActivity = Date.now(); return room;
      });
      await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('tradeOffer', async payload => {
    try {
      throttle(socket, 'trade');
      const result = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        const trade = makeTrade(room, player.id, payload ?? {});
        room.lastActivity = Date.now();
        return { room, trade, player };
      });
      const { room, trade, player } = result;
      const recipient = room.players.find(p => p.id === trade.toId);
      if (recipient?.socketId) io.to(recipient.socketId).emit('tradeOffer', { ...trade, fromName: player.name });
      notice(room, `${player.name} sent a trade offer.`, 'info'); await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('tradeResponse', async payload => {
    try {
      throttle(socket, 'tradeResponse');
      if (typeof payload?.accept !== 'boolean') throw new Error('Choose accept or decline.');
      const room = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        respondTrade(room, player.id, payload.accept); room.lastActivity = Date.now(); return room;
      });
      notice(room, payload.accept ? 'Trade accepted!' : 'Trade declined.', 'info'); await sendState(room);
    } catch (error) { fail(socket, error); }
  });

  socket.on('react', async payload => {
    try {
      throttle(socket, 'reaction', 900);
      const result = await store.mutate(socket.data.roomCode, room => {
        const player = locatePlayer(room, socket);
        const reactions = ['😂', '🔥', '💀', '🤡', '😱', '👑'];
        if (!reactions.includes(payload?.emoji)) throw new Error('That reaction is not available.');
        room.lastActivity = Date.now(); return { room, player };
      });
      io.to(result.room.code).emit('reaction', { playerId: result.player.id, name: result.player.name, emoji: payload.emoji });
    } catch (error) { fail(socket, error); }
  });

  socket.on('disconnect', async () => {
    actionTimes.forEach((_value, key) => { if (key.startsWith(`${socket.id}:`)) actionTimes.delete(key); });
    if (!socket.data.playerId || !socket.data.roomCode) return;
    try {
      const result = await store.mutate(socket.data.roomCode, room => {
        const player = room.players.find(p => p.id === socket.data.playerId);
        if (!player || player.socketId !== socket.id) return { room, changed: false };
        player.online = false; player.socketId = null; room.lastActivity = Date.now();
        if (room.hostId === player.id) {
          room.hostId = room.players.find(p => p.online)?.id ?? player.id;
          const nextHost = room.players.find(p => p.id === room.hostId);
          if (nextHost) notice(room, `${player.name} left. ${nextHost.name} is now host.`, 'info');
        } else notice(room, `${player.name} disconnected. They can rejoin with the same link and code.`, 'info');
        return { room, changed: true };
      });
      if (result.changed) await sendState(result.room);
    } catch { /* The room may have expired while the socket was disconnecting. */ }
  });
});

async function tickRooms() {
  if (redisUnavailable) return;
  const now = Date.now();
  for (const code of await store.codes()) {
    const snapshot = await store.get(code);
    if (!snapshot) continue;
    const abandoned = !snapshot.players.some(p => p.online) && now - snapshot.lastActivity > 30 * 60 * 1000;
    const finishedLongAgo = snapshot.phase === 'results' && now - snapshot.lastActivity > 30 * 60 * 1000;
    if (abandoned || finishedLongAgo) { await store.remove(code); continue; }
    const needsTick = snapshot.phase === 'playing' && (snapshot.endsAt <= now || (snapshot.event && snapshot.event.expiresAt <= now) || now - (snapshot.lastEventAt ?? snapshot.startedAt) >= 42000 || (snapshot.trade && snapshot.trade.expiresAt <= now));
    if (!needsTick) continue;
    try {
      const result = await store.mutate(code, room => {
        if (room.phase !== 'playing') return { room, changed: false, finished: false };
        const finished = finishIfExpired(room, now);
        if (finished) { room.lastActivity = now; return { room, changed: true, finished: true }; }
        let changed = false;
        if (room.event && room.event.expiresAt <= now) { room.event = null; changed = true; }
        if (now - (room.lastEventAt ?? room.startedAt) >= 42000) { nextEvent(room, now); room.lastEventAt = now; changed = true; }
        if (room.trade && room.trade.expiresAt <= now) { room.trade = null; changed = true; }
        if (changed) room.lastActivity = now;
        return { room, changed, finished: false };
      });
      if (result.changed) {
        if (result.finished) notice(result.room, 'Time is up! The city has spoken.', 'success');
        await sendState(result.room);
      }
    } catch { /* A competing function may own this room lock; the next tick retries. */ }
  }
}

app.get('/health', async (_req, res) => {
  if (redisUnavailable) return res.status(503).json({ ok: false, error: 'REDIS_URL is required for Vercel multiplayer.' });
  try { res.json({ ok: true, rooms: await store.count(), sharedState: Boolean(redisClient) }); }
  catch { res.status(503).json({ ok: false, error: 'Shared room storage is unavailable.' }); }
});
const dist = path.resolve(dirname, '../dist');
app.use(express.static(dist));
app.use((_req, res, next) => res.sendFile(path.join(dist, 'index.html'), error => error && next()));

if (!redisUnavailable) setInterval(() => { tickRooms().catch(error => console.error('Game clock error:', error.message)); }, 1000).unref();
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  httpServer.listen(PORT, () => console.log(`Chaos City server listening on ${PORT}`));
}

export { app, httpServer, io, store };
export default httpServer;
