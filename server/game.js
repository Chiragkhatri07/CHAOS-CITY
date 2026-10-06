import { randomInt, randomUUID } from 'node:crypto';

export const MAX_PLAYERS = 8;
export const GAME_DURATION_MS = 10 * 60 * 1000;
export const PROPERTIES = [
  { id: 'cafe', name: 'Moonbean Cafe', icon: '☕', price: 350, income: 44, value: 420 },
  { id: 'arcade', name: 'Pixel Palace', icon: '🕹️', price: 520, income: 65, value: 610 },
  { id: 'grocery', name: 'Oops! All Snacks', icon: '🥫', price: 420, income: 52, value: 490 },
  { id: 'cinema', name: 'The Plot Twist', icon: '🎬', price: 680, income: 78, value: 790 },
  { id: 'hotel', name: 'Cloud Nine Hotel', icon: '🏨', price: 820, income: 90, value: 970 },
  { id: 'tech', name: 'Gadget Garden', icon: '📱', price: 740, income: 86, value: 860 },
  { id: 'restaurant', name: 'Pasta La Vista', icon: '🍝', price: 600, income: 72, value: 700 }
];

export const EVENTS = [
  { title: 'CHICKEN INVASION', text: '500 angry chickens have invaded Chaos City. They demand tiny hats.', kind: 'choice', choices: ['FIGHT', 'HIDE', 'FEED', 'BLAME'] },
  { title: 'TAX DAY', text: 'Congratulations! The government remembered you exist.', kind: 'tax' },
  { title: 'ALIEN LANDING', text: 'Visitors from space want your Wi-Fi password. They have zero bars.', kind: 'choice', choices: ['NEGOTIATE', 'FIGHT', 'HIDE', 'BRIBE'] },
  { title: 'BANK ROBBERY', text: 'The bank has been robbed. The getaway vehicle is suspiciously tiny.', kind: 'investigate' },
  { title: "MAYOR'S MYSTERY BOX", text: 'A mystery box appears at City Hall. It is humming show tunes.', kind: 'mystery' },
  { title: 'FREE MONEY', text: 'Someone accidentally printed money. The printer is still going.', kind: 'free' },
  { title: 'CITY POWER OUTAGE', text: 'The lights are out! Property income takes a quick nap.', kind: 'outage' },
  { title: 'INFLUENCER VISITS', text: 'A famous influencer has tagged a local business. #Ad #Probably', kind: 'boost' },
  { title: 'INTERNET DOWN', text: 'The internet is down. Trades are offline until the router returns.', kind: 'quiet' },
  { title: 'POTATO EMERGENCY', text: 'A mysterious potato appears. The player who taps it first wins a prize.', kind: 'potato' },
  { title: 'PIGEON SUMMIT', text: 'Pigeons have formed a council. They are negotiating for more benches.', kind: 'choice', choices: ['SIT', 'SCATTER', 'OFFER CRUMBS'] },
  { title: 'SIDEWALK SALE', text: 'Everything must go! Property deals are suddenly very good.', kind: 'sale' },
  { title: 'SUSPICIOUS FOG', text: 'A dramatic fog rolls in. Reputation is worth extra today.', kind: 'reputation' },
  { title: 'GIANT INFLATABLE DUCK', text: 'A giant duck blocks the bridge. It seems open to negotiation.', kind: 'choice', choices: ['HONK BACK', 'GO AROUND', 'OFFER A HAT'] },
  { title: 'CITY-WIDE KARAOKE', text: 'The city sings together. Confidence is up; energy is down.', kind: 'karaoke' },
  { title: 'LUCKY SOCK DAY', text: 'The city is full of lucky socks. Today, bold moves pay off.', kind: 'luck' }
];

const AVATARS = ['🦊', '🐸', '🐼', '🦝', '🐯', '🐙', '🦄', '🐨'];
const ROLES = ['Detective', 'Investor', 'Influencer', 'Saboteur', 'Lucky Player', 'Entrepreneur', 'Park Ranger', 'Wildcard'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function cleanName(value) {
  const name = String(value ?? '').trim().replace(/[<>]/g, '').slice(0, 18);
  if (name.length < 2) throw new Error('Name must be at least 2 characters.');
  return name;
}

export function makeCode(existing = new Set()) {
  let code;
  do { code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join(''); } while (existing.has(code));
  return code;
}

export function createRoom(name) {
  const hostId = randomUUID();
  const token = randomUUID();
  const player = makePlayer(hostId, token, name, true);
  return {
    code: makeCode(), phase: 'lobby', hostId, players: [player], properties: PROPERTIES.map(p => ({ ...p, ownerId: null })),
    event: null, history: [], startedAt: null, endsAt: null, round: 0, lastActivity: Date.now(), trade: null
  };
}

export function makePlayer(id, token, name, online = false) {
  return { id, token, name: cleanName(name), avatar: AVATARS[randomInt(AVATARS.length)], role: ROLES[randomInt(ROLES.length)], online, money: 1000, reputation: 50, energy: 100, score: 0, earned: 0, spent: 0, eventsWon: 0, actions: 0, investigated: false, cooldowns: {}, createdAt: Date.now() };
}

export function publicState(room, viewerId = null) {
  const now = Date.now();
  const players = room.players.map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, online: p.online, host: p.id === room.hostId,
    money: p.money, reputation: p.reputation, energy: p.energy, score: p.score,
    ownedProperties: room.properties.filter(x => x.ownerId === p.id).map(x => x.id),
    role: p.id === viewerId ? p.role : undefined, cooldowns: p.id === viewerId ? p.cooldowns : undefined,
    investigated: p.id === viewerId ? p.investigated : undefined
  }));
  const leaderboard = [...players].sort((a, b) => b.score - a.score || b.money - a.money).map((p, i) => ({ ...p, rank: i + 1 }));
  return {
    code: room.code, phase: room.phase, hostId: room.hostId, players, properties: room.properties.map(({ id, name, icon, price, income, value, ownerId }) => ({ id, name, icon, price, income, value, ownerId })),
    event: room.event ? { ...room.event, responded: Boolean(room.event.responses?.[viewerId]), responses: undefined } : null, history: room.history.slice(-5), leaderboard, round: room.round,
    remainingMs: room.endsAt ? Math.max(0, room.endsAt - now) : null,
    trade: room.trade ? { id: room.trade.id, fromId: room.trade.fromId, toId: room.trade.toId, amount: room.trade.amount, propertyId: room.trade.propertyId, expiresAt: room.trade.expiresAt } : null,
    awards: room.phase === 'results' ? calculateAwards(room) : undefined,
    winnerId: room.phase === 'results' ? leaderboard[0]?.id : undefined
  };
}

export function calculateScores(room) {
  for (const player of room.players) {
    const assets = room.properties.filter(p => p.ownerId === player.id).reduce((n, p) => n + p.value, 0);
    player.score = Math.max(0, Math.round(player.money + assets + player.reputation * 8 + player.eventsWon * 75));
  }
  return [...room.players].sort((a, b) => b.score - a.score || b.money - a.money);
}

export function calculateAwards(room) {
  const best = (fn) => [...room.players].sort((a, b) => fn(b) - fn(a))[0];
  return [
    { title: 'MAYOR OF CHAOS', icon: '👑', playerId: calculateScores(room)[0]?.id },
    { title: 'MONEY MACHINE', icon: '💰', playerId: best(p => p.money).id },
    { title: 'CITY SOCIALITE', icon: '✨', playerId: best(p => p.reputation).id },
    { title: 'PROPERTY MOGUL', icon: '🏙️', playerId: best(p => room.properties.filter(x => x.ownerId === p.id).length).id },
    { title: 'ACTION HERO', icon: '⚡', playerId: best(p => p.actions).id }
  ];
}

function reward(player, amount) {
  player.money = Math.max(0, player.money + amount);
  if (amount > 0) player.earned += amount; else player.spent += -amount;
}

export function startGame(room, now = Date.now()) {
  if (room.phase !== 'lobby') throw new Error('This room has already started.');
  if (room.players.filter(p => p.online).length < 2) throw new Error('At least 2 players are needed to start.');
  room.phase = 'playing'; room.startedAt = now; room.endsAt = now + GAME_DURATION_MS; room.round = 1;
  room.history.push({ text: 'The city gates are open. Make your move!', at: now });
}

export function updateScores(room) { return calculateScores(room); }

export function doAction(room, playerId, action, data = {}, now = Date.now()) {
  if (room.phase !== 'playing') throw new Error('Actions are only available during the game.');
  if (room.endsAt <= now) { finishGame(room); throw new Error('Time is up!'); }
  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.online) throw new Error('Player is not connected to this room.');
  if (player.energy < 10) throw new Error('You need at least 10 energy for an action. Visit the park to recover.');
  const cooldown = player.cooldowns[action];
  if (cooldown && cooldown > now) throw new Error('That move is cooling down.');

  if (action === 'earn') {
    const amount = 110 + randomInt(91) + (player.role === 'Entrepreneur' ? 30 : 0);
    reward(player, amount); player.energy -= 10; player.reputation = Math.min(100, player.reputation + 1);
    room.history.push({ text: `${player.name} completed a gig and earned $${amount}.`, at: now });
  } else if (action === 'invest') {
    const amount = Number(data.amount);
    if (![100, 200, 300].includes(amount) || player.money < amount) throw new Error('Choose an affordable investment of $100, $200, or $300.');
    const chance = player.role === 'Investor' ? 0.78 : 0.62;
    const success = Math.random() < chance;
    const delta = success ? Math.round(amount * (0.55 + Math.random() * 0.55)) : -Math.round(amount * 0.45);
    reward(player, delta); player.energy -= 15; player.cooldowns.invest = now + 15000;
    room.history.push({ text: `${player.name} ${success ? 'made a smart investment' : 'took a market hit'} (${delta >= 0 ? '+' : ''}$${delta}).`, at: now });
  } else if (action === 'buy') {
    const property = room.properties.find(p => p.id === data.propertyId);
    if (!property) throw new Error('That property does not exist.');
    if (property.ownerId) throw new Error('That property already has an owner.');
    if (player.money < property.price) throw new Error('Not enough money for that property.');
    reward(player, -property.price); property.ownerId = player.id; player.energy -= 12;
    room.history.push({ text: `${player.name} bought ${property.name}.`, at: now });
  } else if (action === 'collect') {
    const owned = room.properties.filter(p => p.ownerId === player.id);
    if (!owned.length) throw new Error('Buy a property first to collect rent.');
    const income = owned.reduce((n, p) => n + p.income, 0);
    reward(player, income); player.energy -= 12; player.cooldowns.collect = now + 20000;
    room.history.push({ text: `${player.name} collected $${income} in property income.`, at: now });
  } else if (action === 'casino') {
    if (player.money < 100) throw new Error('The casino table minimum is $100.');
    const wager = 100; const won = Math.random() < (player.role === 'Lucky Player' ? 0.58 : 0.46);
    reward(player, won ? wager : -wager); player.energy -= 18; player.cooldowns.casino = now + 25000;
    room.history.push({ text: `${player.name} ${won ? 'won' : 'lost'} $100 at the casino.`, at: now });
  } else if (action === 'recover') {
    player.energy = Math.min(100, player.energy + 35); player.reputation = Math.min(100, player.reputation + 2);
    room.history.push({ text: `${player.name} took a breather in the park.`, at: now });
  } else if (action === 'investigate') {
    if (player.role !== 'Detective') throw new Error('Only the Detective can investigate.');
    if (player.investigated) throw new Error('You have already used your investigation.');
    const target = room.players.find(p => p.id === data.targetId && p.id !== playerId);
    if (!target) throw new Error('Choose another player to investigate.');
    player.investigated = true; player.energy -= 8;
    room.history.push({ text: `${player.name} quietly investigated a city rumor.`, at: now });
  } else if (action === 'sabotage') {
    if (player.role !== 'Saboteur') throw new Error('Only the Saboteur can sabotage.');
    const property = room.properties.find(p => p.id === data.propertyId && p.ownerId && p.ownerId !== playerId);
    if (!property) throw new Error('Choose an opponent-owned property.');
    player.energy -= 20; player.cooldowns.sabotage = now + 45000;
    const owner = room.players.find(p => p.id === property.ownerId); reward(owner, -Math.min(80, Math.floor(property.income)));
    room.history.push({ text: `${player.name} caused a mysterious hiccup at ${property.name}.`, at: now });
  } else if (action === 'challenge') {
    const target = room.players.find(p => p.id === data.targetId && p.id !== playerId && p.online);
    if (!target) throw new Error('Choose another connected player.');
    const youWin = Math.random() < 0.5;
    reward(player, youWin ? 80 : -40); if (youWin) reward(target, -40); else reward(target, 80);
    player.energy -= 16; target.energy = Math.max(0, target.energy - 8);
    room.history.push({ text: `${player.name} challenged ${target.name} to a reaction duel. ${youWin ? player.name : target.name} won!`, at: now });
  } else throw new Error('That action is not recognized.');

  player.actions += 1;
  if (room.event?.kind === 'potato' && !room.event.winnerId) {
    room.event.winnerId = playerId; reward(player, 125); player.eventsWon += 1;
    room.history.push({ text: `${player.name} caught the potato and won $125!`, at: now });
  }
  calculateScores(room);
  return publicState(room, playerId);
}

export function resolveEvent(room, playerId, choice, now = Date.now()) {
  if (room.phase !== 'playing' || !room.event) throw new Error('There is no active city event.');
  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.online) throw new Error('Player is not connected to this room.');
  if (room.event.kind !== 'choice') throw new Error('This event does not take a choice.');
  if (!room.event.choices.includes(choice)) throw new Error('Choose one of the listed event responses.');
  if (room.event.responses[playerId]) throw new Error('You have already responded to this event.');
  room.event.responses[playerId] = choice;
  const index = room.event.choices.indexOf(choice);
  const outcomes = [90, 15, -35, 45];
  const amount = outcomes[index] ?? 25;
  reward(player, amount); player.reputation = Math.min(100, Math.max(0, player.reputation + (index === 0 ? 2 : index === 2 ? -1 : 1)));
  if (amount > 0) player.eventsWon += 1;
  room.history.push({ text: `${player.name} chose to ${choice.toLowerCase()} (+$${Math.max(0, amount)}).`, at: now });
  calculateScores(room);
  return publicState(room, playerId);
}

export function nextEvent(room, now = Date.now(), event = EVENTS[randomInt(EVENTS.length)]) {
  if (room.phase !== 'playing') return null;
  room.round += 1;
  const current = { ...event, id: randomUUID(), startedAt: now, expiresAt: now + (event.kind === 'potato' ? 12000 : 25000), responses: {} };
  if (event.kind === 'tax') for (const p of room.players) reward(p, -Math.min(90, Math.floor(p.money * 0.07)));
  if (event.kind === 'free') for (const p of room.players) reward(p, 50 + randomInt(101));
  if (event.kind === 'outage') for (const p of room.players) reward(p, -room.properties.filter(x => x.ownerId === p.id).reduce((n, x) => n + Math.floor(x.income * 0.5), 0));
  if (event.kind === 'mystery' && room.players.length) {
    const winner = room.players[randomInt(room.players.length)]; const prize = [500, 200, -100, 350][randomInt(4)]; reward(winner, prize); if (prize > 0) winner.eventsWon += 1;
    current.winnerId = winner.id; current.prize = prize;
  }
  if (event.kind === 'boost' && room.properties.length) {
    const property = room.properties[randomInt(room.properties.length)]; property.value = Math.round(property.value * 1.2); current.propertyId = property.id;
  }
  if (event.kind === 'sale') for (const p of room.properties) if (!p.ownerId) p.price = Math.max(100, Math.round(p.price * 0.85));
  if (event.kind === 'reputation') for (const p of room.players) p.reputation = Math.min(100, p.reputation + 2);
  if (event.kind === 'karaoke') for (const p of room.players) { p.reputation = Math.min(100, p.reputation + 3); p.energy = Math.max(0, p.energy - 5); }
  room.event = current;
  room.history.push({ text: `City event: ${event.title}.`, at: now });
  calculateScores(room);
  return current;
}

export function finishGame(room) {
  if (room.phase === 'results') return room;
  room.phase = 'results'; room.endsAt = Date.now(); calculateScores(room);
  room.history.push({ text: `${room.players.find(p => p.id === calculateScores(room)[0]?.id)?.name ?? 'The city'} became Mayor of Chaos!`, at: Date.now() });
  return room;
}

export function makeTrade(room, fromId, data, now = Date.now()) {
  if (room.phase !== 'playing') throw new Error('Trades are only available during the game.');
  if (room.event?.kind === 'quiet') throw new Error('The internet is down. Trades are offline until the router returns.');
  if (room.trade && room.trade.expiresAt > now) throw new Error('A trade is already waiting for a response.');
  const from = room.players.find(p => p.id === fromId);
  const to = room.players.find(p => p.id === data.toId && p.online && p.id !== fromId);
  const property = data.propertyId ? room.properties.find(p => p.id === data.propertyId && p.ownerId === fromId) : null;
  const amount = Number(data.amount ?? 0);
  if (!from || !to) throw new Error('Choose a connected player to trade with.');
  if (!Number.isInteger(amount) || amount < 0 || amount > from.money) throw new Error('Offer an affordable whole dollar amount.');
  if (data.propertyId && !property) throw new Error('You can only offer a property you own.');
  room.trade = { id: randomUUID(), fromId, toId: to.id, amount, propertyId: property?.id ?? null, expiresAt: now + 30000 };
  return room.trade;
}

export function respondTrade(room, playerId, accept, now = Date.now()) {
  const trade = room.trade;
  if (!trade || trade.toId !== playerId || trade.expiresAt < now) throw new Error('There is no trade waiting for you.');
  if (accept) {
    const from = room.players.find(p => p.id === trade.fromId); const to = room.players.find(p => p.id === trade.toId);
    if (!from || !to || from.money < trade.amount) throw new Error('Trade could not be completed.');
    reward(from, -trade.amount); reward(to, trade.amount);
    if (trade.propertyId) { const property = room.properties.find(p => p.id === trade.propertyId); if (property?.ownerId === from.id) property.ownerId = to.id; }
    room.history.push({ text: `${to.name} accepted ${from.name}'s trade offer.`, at: now });
  }
  room.trade = null; calculateScores(room);
}

export function finishIfExpired(room, now = Date.now()) {
  if (room.phase === 'playing' && room.endsAt <= now) finishGame(room);
  return room.phase === 'results';
}
