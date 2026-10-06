import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createRoom, cleanName, doAction, finishIfExpired, makeCode, makeTrade, makePlayer, nextEvent, PROPERTIES, publicState, respondTrade, resolveEvent, startGame } from './game.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: CLIENT_ORIGIN ? { origin: CLIENT_ORIGIN.split(',').map(x => x.trim()), methods: ['GET', 'POST'] } : false,
  maxHttpBufferSize: 1e5,
  pingInterval: 25000,
  pingTimeout: 20000
});
const rooms = new Map();
const socketPlayers = new Map();
const actionTimes = new Map();
const dirname = path.dirname(fileURLToPath(import.meta.url));

function sendState(room) {
  for (const player of room.players) {
    const socketId = socketPlayers.get(player.id);
    if (socketId) io.to(socketId).emit('state', publicState(room, player.id));
  }
}
function notice(room, message, kind = 'info') { io.to(room.code).emit('notice', { message, kind }); }
function fail(socket, error) { socket.emit('errorMessage', { message: error?.message ?? 'Something went wrong.' }); }
function locatePlayer(socket) {
  const id = socket.data.playerId;
  const room = socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
  const player = room?.players.find(p => p.id === id);
  if (!room || !player) throw new Error('Your room session has expired. Join a room again.');
  return { room, player };
}
function throttle(socket, key, cooldown = 350) {
  const id = `${socket.id}:${key}`; const now = Date.now();
  if ((actionTimes.get(id) ?? 0) > now - cooldown) throw new Error('One moment! Your last action is still processing.');
  actionTimes.set(id, now);
}
function joinSocket(socket, room, player) {
  const oldSocket = socketPlayers.get(player.id);
  if (oldSocket && oldSocket !== socket.id) io.sockets.sockets.get(oldSocket)?.disconnect(true);
  player.online = true; socketPlayers.set(player.id, socket.id);
  socket.data.playerId = player.id; socket.data.roomCode = room.code;
  socket.join(room.code); room.lastActivity = Date.now();
  sendState(room);
}

io.on('connection', socket => {
  socket.emit('connected', { id: socket.id });
  socket.on('createRoom', (payload = {}) => {
    try {
      throttle(socket, 'create');
      const name = cleanName(payload.name);
      let room = createRoom(name);
      while (rooms.has(room.code)) room.code = makeCode(new Set(rooms.keys()));
      rooms.set(room.code, room); joinSocket(socket, room, room.players[0]);
      socket.emit('session', { code: room.code, playerId: room.hostId, token: room.players[0].token });
      sendState(room);
    } catch (error) { fail(socket, error); }
  });
  socket.on('joinRoom', (payload = {}) => {
    try {
      throttle(socket, 'join');
      const code = String(payload.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const room = rooms.get(code);
      if (!room) throw new Error('Room not found. Check the code and try again.');
      if (room.phase !== 'lobby') throw new Error('This game has already started.');
      if (room.players.length >= 8) throw new Error('This room is full.');
      const name = cleanName(payload.name);
      if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already in the room. Try another.');
      const token = randomUUID();
      const player = makePlayer(randomUUID(), token, name, true);
      room.players.push(player); room.lastActivity = Date.now(); joinSocket(socket, room, player);
      socket.emit('session', { code: room.code, playerId: player.id, token });
      notice(room, `${player.name} just rolled into town.`, 'success'); sendState(room);
    } catch (error) { fail(socket, error); }
  });
  socket.on('reconnectRoom', (payload = {}) => {
    try {
      throttle(socket, 'reconnect');
      const room = rooms.get(String(payload.code ?? '').toUpperCase());
      const player = room?.players.find(p => p.id === payload.playerId && p.token === payload.token);
      if (!room || !player) throw new Error('Could not restore that room session.');
      joinSocket(socket, room, player); room.lastActivity = Date.now();
      socket.emit('session', { code: room.code, playerId: player.id, token: player.token });
      notice(room, `${player.name} is back in the city.`, 'success'); sendState(room);
    } catch (error) { fail(socket, error); }
  });
  socket.on('startGame', () => {
    try {
      throttle(socket, 'start'); const { room, player } = locatePlayer(socket);
      if (player.id !== room.hostId) throw new Error('Only the host can start the game.');
      startGame(room); notice(room, 'The city is yours. Make it count!', 'success'); sendState(room);
    } catch (error) { fail(socket, error); }
  });
  socket.on('rematch', () => {
    try {
      throttle(socket, 'rematch'); const { room, player } = locatePlayer(socket);
      if (player.id !== room.hostId) throw new Error('Only the host can start a rematch.');
      if (room.phase !== 'results') throw new Error('The current game is still in progress.');
      room.phase = 'lobby'; room.event = null; room.trade = null; room.startedAt = null; room.endsAt = null; room.round = 0; room.lastEventAt = null; room.history = [];
      room.properties = PROPERTIES.map(p => ({ ...p, ownerId: null }));
      for (const p of room.players) Object.assign(p, { money: 1000, reputation: 50, energy: 100, score: 0, earned: 0, spent: 0, eventsWon: 0, actions: 0, investigated: false, cooldowns: {} });
      sendState(room); notice(room, 'New game, fresh chaos. Waiting for the host!', 'success');
    } catch (error) { fail(socket, error); }
  });
  socket.on('action', payload => {
    try { throttle(socket, 'action'); const { room, player } = locatePlayer(socket); doAction(room, player.id, payload?.action, payload?.data); sendState(room); }
    catch (error) { fail(socket, error); }
  });
  socket.on('eventChoice', payload => {
    try { throttle(socket, 'event'); const { room, player } = locatePlayer(socket); resolveEvent(room, player.id, payload?.choice); sendState(room); }
    catch (error) { fail(socket, error); }
  });
  socket.on('tradeOffer', payload => {
    try {
      throttle(socket, 'trade'); const { room, player } = locatePlayer(socket); const trade = makeTrade(room, player.id, payload ?? {});
      const recipient = socketPlayers.get(trade.toId); if (recipient) io.to(recipient).emit('tradeOffer', { ...trade, fromName: player.name });
      notice(room, `${player.name} sent a trade offer.`, 'info'); sendState(room);
    } catch (error) { fail(socket, error); }
  });
  socket.on('tradeResponse', payload => {
    try { throttle(socket, 'tradeResponse'); const { room, player } = locatePlayer(socket); if (typeof payload?.accept !== 'boolean') throw new Error('Choose accept or decline.'); respondTrade(room, player.id, payload.accept); notice(room, payload.accept ? 'Trade accepted!' : 'Trade declined.', 'info'); sendState(room); }
    catch (error) { fail(socket, error); }
  });
  socket.on('react', payload => {
    try {
      throttle(socket, 'reaction', 900); const { room, player } = locatePlayer(socket);
      const reactions = ['😂', '🔥', '💀', '🤡', '😱', '👑'];
      if (!reactions.includes(payload?.emoji)) throw new Error('That reaction is not available.');
      io.to(room.code).emit('reaction', { playerId: player.id, name: player.name, emoji: payload.emoji });
    } catch (error) { fail(socket, error); }
  });
  socket.on('disconnect', () => {
    const playerId = socket.data.playerId; const room = rooms.get(socket.data.roomCode);
    if (!playerId || !room || socketPlayers.get(playerId) !== socket.id) return;
    const player = room.players.find(p => p.id === playerId);
    socketPlayers.delete(playerId); player.online = false; room.lastActivity = Date.now();
    if (room.hostId === playerId) {
      room.hostId = room.players.find(p => p.online)?.id ?? playerId;
      const nextHost = room.players.find(p => p.id === room.hostId);
      if (nextHost) notice(room, `${player.name} left. ${nextHost.name} is now host.`, 'info');
    } else notice(room, `${player.name} disconnected. They can rejoin with the same link and code.`, 'info');
    sendState(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.phase === 'playing') {
      if (finishIfExpired(room, now)) { notice(room, 'Time is up! The city has spoken.', 'success'); sendState(room); continue; }
      if (room.event && room.event.expiresAt <= now) { room.event = null; sendState(room); }
      if (now - (room.lastEventAt ?? room.startedAt) >= 42000) { nextEvent(room, now); room.lastEventAt = now; sendState(room); }
      if (room.trade && room.trade.expiresAt <= now) { room.trade = null; sendState(room); }
    }
    const emptyLongEnough = !room.players.some(p => p.online) && now - room.lastActivity > 30 * 60 * 1000;
    if (emptyLongEnough || (room.phase === 'results' && now - room.lastActivity > 30 * 60 * 1000)) rooms.delete(code);
  }
}, 1000).unref();

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const dist = path.resolve(dirname, '../dist');
app.use(express.static(dist));
app.use((_req, res, next) => res.sendFile(path.join(dist, 'index.html'), error => error && next()));
httpServer.listen(PORT, () => console.log(`Chaos City server listening on ${PORT}`));
