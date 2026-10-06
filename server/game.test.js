import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, doAction, finishGame, GAME_DURATION_MS, makePlayer, makeTrade, nextEvent, publicState, PROPERTIES, respondTrade, resolveEvent, startGame } from './game.js';

function roomWithTwo() {
  const room = createRoom('Mayor Fox');
  const second = makePlayer('player-2', 'token-2', 'Mayor Frog', true);
  room.players[0].online = true;
  room.players.push(second);
  return room;
}

test('creates a unique-looking five-character room with safe player defaults', () => {
  const room = createRoom('City Fox');
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players[0].money, 1000);
  assert.equal(room.players[0].reputation, 50);
  assert.equal(room.players[0].energy, 100);
});

test('normalizes names and rejects names that are too short', () => {
  const room = createRoom('  City Fox  ');
  assert.equal(room.players[0].name, 'City Fox');
  assert.throws(() => createRoom('x'), /at least 2/);
});

test('game start requires two online players and sets the server deadline', () => {
  const solo = createRoom('Solo');
  assert.throws(() => startGame(solo, 1000), /At least 2/);
  const room = roomWithTwo(); startGame(room, 1000);
  assert.equal(room.phase, 'playing');
  assert.equal(room.endsAt, 1000 + GAME_DURATION_MS);
});

test('property purchase is validated and score includes owned asset value', () => {
  const room = roomWithTwo(); startGame(room);
  const buyer = room.players[0];
  doAction(room, buyer.id, 'buy', { propertyId: 'cafe' });
  assert.equal(room.properties.find(p => p.id === 'cafe').ownerId, buyer.id);
  assert.equal(buyer.money, 1000 - PROPERTIES[0].price);
  assert.ok(buyer.score >= buyer.money + PROPERTIES[0].value + buyer.reputation * 8);
  assert.throws(() => doAction(room, room.players[1].id, 'buy', { propertyId: 'cafe' }), /already has an owner/);
});

test('validates action types, energy and game phase on the server', () => {
  const room = roomWithTwo();
  assert.throws(() => doAction(room, room.players[0].id, 'earn'), /only available during the game/);
  startGame(room);
  assert.throws(() => doAction(room, room.players[0].id, 'set-money', { value: 999999 }), /not recognized/);
  room.players[0].energy = 0;
  assert.throws(() => doAction(room, room.players[0].id, 'earn'), /at least 10 energy/);
});

test('event choices are validated and only one response is accepted per player', () => {
  const room = roomWithTwo(); startGame(room); nextEvent(room, Date.now(), { title: 'Test event', text: 'Pick a plan.', kind: 'choice', choices: ['HIDE', 'FEED'] });
  const initialMoney = room.players[0].money;
  assert.throws(() => resolveEvent(room, room.players[0].id, 'INVALID'), /listed event responses/);
  resolveEvent(room, room.players[0].id, 'HIDE');
  assert.ok(room.players[0].money > initialMoney);
  assert.throws(() => resolveEvent(room, room.players[0].id, 'FEED'), /already responded/);
  assert.equal(publicState(room, room.players[0].id).event.responded, true);
  assert.equal(publicState(room, room.players[1].id).event.responded, false);
});

test('trade requires an owned offer and explicit recipient acceptance', () => {
  const room = roomWithTwo(); startGame(room);
  room.properties[0].ownerId = room.players[0].id;
  makeTrade(room, room.players[0].id, { toId: room.players[1].id, amount: 100, propertyId: 'cafe' });
  respondTrade(room, room.players[1].id, true);
  assert.equal(room.players[0].money, 900);
  assert.equal(room.players[1].money, 1100);
  assert.equal(room.properties[0].ownerId, room.players[1].id);
  assert.equal(room.trade, null);
  assert.throws(() => makeTrade(room, room.players[0].id, { toId: room.players[1].id, propertyId: 'cafe' }), /only offer a property you own/);
});

test('final standings are calculated on the server and game cannot continue after final results', () => {
  const room = roomWithTwo(); startGame(room);
  room.players[1].money = 2500;
  finishGame(room);
  assert.equal(room.phase, 'results');
  assert.equal(publicState(room).winnerId, room.players[1].id);
  assert.throws(() => doAction(room, room.players[0].id, 'earn'), /only available during the game/);
});
