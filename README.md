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
- **State:** In memory on one Node process. There is no database or account data. Rooms are removed after 30 minutes when abandoned or after results.
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

Never commit `.env` or production secrets. The current server does not need secrets.

## Build and tests

```sh
npm test
npm run build
npm start
```

The Node test suite covers room creation and name validation, lobby start requirements, time limits, server action validation, property buying and scoring, event choices, trades, and winner calculation. `/health` returns a small process health response.

## Deployment

`render.yaml` describes a single Node web service that builds the frontend and serves it from the game server. Connect this repository to Render, create the web service from the Blueprint, and use its generated HTTPS hostname. A single always-on Node instance is required because rooms currently live in process memory. Do not scale to multiple instances without adding shared room state and a Socket.IO adapter. Set `CLIENT_ORIGIN` only if the UI is moved to a different origin.

For a manual Node host, use `npm install`, `npm run build`, then `npm start`; route HTTPS and WebSocket traffic to the same process and retain one instance. `PORT` is read from the host environment.

## Limitations and next steps

- Rooms and matches are lost when the server restarts; there is no persistence or cross-instance adapter.
- Reconnection is available while the room remains in memory. There is no long term account recovery.
- Mini games are represented by a quick server resolved challenge rather than a separate animated reaction/memory interface.
- Mobile layouts are implemented in CSS; this checkout does not include browser automation or physical device lab access.
- The deployment descriptor is ready, but a public launch still requires an authorized hosting account and repository connection.

## Project layout

```text
src/                React UI and responsive styles
server/game.js      Room state, game rules, economy, events, scoring
server/index.js     HTTP server, Socket.IO protocol, reconnection, cleanup
server/game.test.js Authoritative game logic tests
render.yaml         Single service deployment blueprint
```
