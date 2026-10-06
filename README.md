# Chaos City

**Build your fortune. Ruin your friends. Become Mayor of Chaos.**

Chaos City is a browser based multiplayer party strategy game for 2–8 friends. Create a room, share its five character code, and compete for ten minutes in a cartoon city full of businesses, quick decisions, and unpredictable events. No accounts or downloads are needed.

## Features

- Live rooms and lobby over Socket.IO, with a five character room code and an eight player limit.
- Server owned player money, energy, reputation, properties, events, scores, game clock, trades, and winner calculation.
- Ten minute match, seven purchasable businesses, actions with energy costs and cooldowns, trades that require recipient acceptance, private player roles, and sixteen city event types.
- Reconnect using a random resume token saved in the browser; disconnected hosts are replaced automatically.
- Live leaderboard, city activity feed, reactions, final awards, and host controlled rematches.
- Responsive city map and thumb friendly controls, reduced motion support, and optional UI click sounds.

## How to play

1. Enter a display name and create a room, or join with a friend's code.
2. The host starts when at least two people are online.
3. Earn cash, buy businesses, collect rent, invest, trade, or challenge a friend. Actions consume energy; recover in the park.
4. React to city events before they expire.
5. After ten minutes, the server scores cash + property value + reputation bonus + event wins. Highest score takes the crown.

## Architecture

- **Client:** React, Vite, and plain responsive CSS. Socket.IO carries server snapshots and player requests.
- **Server:** Node.js, Express, and Socket.IO. `server/game.js` owns the game rules and scoring; `server/index.js` owns rooms, sockets, cleanup, rate limits, and phase transitions.
- **Local state:** In memory on one Node process for simple local development. There is no player account data.
- **Vercel state:** Room state and room locks are stored in Redis with a TTL. Socket.IO uses its Redis adapter to broadcast between Function instances. This is required because a reconnect or a new player's WebSocket can reach a different instance.
- **Trust boundary:** Clients send only action names and small inputs. The server validates phase, energy, ownership, balance, trade consent, and event choices, then broadcasts a tailored public state. Hidden role details are sent only to that player.

## Local development

Requirements: Node.js 20 or later and npm.

```sh
npm install
Copy-Item .env.example .env
npm run dev
```

The Vite client runs at `http://localhost:5173`; the game server runs at `http://localhost:3001`. Open multiple browser windows to exercise rooms. The Vite dev server proxies Socket.IO to the Node server.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP and Socket.IO port (default `3001`; hosting services normally set this). |
| `CLIENT_ORIGIN` | No | Comma separated allowed browser origins when the client is hosted separately. Leave unset when the Node server also serves `dist` on the same origin. |
| `REDIS_URL` | Vercel only | Redis TCP connection string used by Vercel Functions for shared room storage and Socket.IO pub/sub. Use the TLS `rediss://` URL from the Upstash Vercel integration. Do not use the REST URL/token pair. |

Never commit `.env` or production secrets. Local development can run without Redis.

## Build and tests

```sh
npm test
npm run build
npm start
```

The Node test suite covers room creation and name validation, lobby start requirements, time limits, server action validation, property buying and scoring, event choices, trades, and winner calculation. `/health` returns a small process health response.

## Deployment

Vercel is the production target. Import this GitHub repository into Vercel, add an Upstash Redis database through the Vercel Marketplace, and attach its `REDIS_URL` TCP connection string to the project for Production and Preview. Redeploy after the variable is available. `vercel.json` builds the static Vite client and configures the Socket.IO function at `/api/socket-io`; the production client uses WebSocket transport at `/api/socket-io/socket.io`. The Socket.IO Redis adapter and Redis-backed room locks keep clients synchronized across function instances. Connections can close at the function duration limit, so the client reconnects with its room resume token.

The Vercel deployment requires a Redis database integration. Without `REDIS_URL`, the production Socket.IO endpoint refuses connections rather than running unsynchronized per-instance rooms. `/api/health` reports whether that required configuration is present. `render.yaml` remains as a single-process alternative for a Node host.

For a manual Node host, use `npm install`, `npm run build`, then `npm start`; route HTTPS and WebSocket traffic to the same process and retain one instance. `PORT` is read from the host environment.

## Limitations and next steps

- Local rooms are lost when the Node server restarts. Vercel rooms persist in Redis until their 30 minute TTL expires.
- Reconnection is available while the room remains in memory. There is no long term account recovery.
- Mini games are represented by a quick server resolved challenge rather than a separate animated reaction/memory interface.
- Mobile layouts are implemented in CSS; this checkout does not include browser automation or physical device lab access.
- Production WebSockets on Vercel are in public beta and connections are subject to Function duration limits; the client reconnects automatically.

## Project layout

```text
src/                React UI and responsive styles
server/game.js      Room state, game rules, economy, events, scoring
server/index.js     HTTP server, Socket.IO protocol, reconnection, cleanup
server/game.test.js Authoritative game logic tests
api/socket-io.js    Vercel Socket.IO WebSocket function
server/room-store.js Redis-backed shared room store with local memory mode
vercel.json         Vercel build and function configuration
render.yaml         Single-service alternative deployment blueprint
```
