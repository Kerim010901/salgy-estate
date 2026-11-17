# Salgy

A local implementation of the Salgy Turkmen property marketplace UI, based on https://mekan-ashgabat.kgijow.chatgpt.site/.

## Run

Requires Node.js 24 or newer. No package installation or external database is required.

```sh
npm start
```

Open http://127.0.0.1:3000. Use `npm run dev` for server watch mode.

The database starts empty. Register your own account and publish your listings. No demo accounts, seeded listings, sample messages, or invented market data are included.

## Features

- Original Turkmen interface, responsive layouts, local photos, and regional map.
- Email/password registration and login, hashed passwords, persistent sessions, and logout.
- Create/edit/archive property listings; up to three uploaded images per listing.
- Buy/rent/commercial search, price/room/area/feature filters, and sorting.
- Favorites, saved searches, comparison, user profiles, and moving checklists.
- Private property inquiries and replies; agent directory and agent profile creation.
- Loan and price-per-square-meter calculators using user-supplied inputs.
- Keyword-based natural-language property search. This is a search parser, not a connected AI service.

## Storage and configuration

Data is stored in `data/salgy.sqlite` with SQLite WAL mode. Images uploaded by users are compressed in the browser and stored with the listing. The public directory is the only directory served over HTTP. Restarting the server preserves accounts and data.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Listening interface; use `0.0.0.0` for container/network hosting |
| `DATABASE_PATH` | `data/salgy.sqlite` | SQLite database path |
| `APP_ORIGIN` | Request host | Additional allowed origin behind a reverse proxy |
| `COOKIE_SECURE` | `false` | Set to `true` when serving over HTTPS |

Environment variables are read from the process. For a local env file, Node supports `node --env-file=.env server.mjs`; the default start command does not automatically load `.env`.

For public deployment, run behind HTTPS, set `COOKIE_SECURE=true`, and back up the SQLite database using SQLite's backup API or stop the server before copying all database/WAL files. This implementation does not include email verification, password recovery, listing moderation, or an external AI integration.

## Verification

```sh
npm run check
npm test
```

Tests use temporary databases and exercise registration, sessions, ownership checks, listing validation, archives, favorites, saved searches, profiles, messaging, map/assets, search parsing, and persistence after restarting. They do not add records to the app's database. Browser checks run automatically when Chrome or Edge is installed at a supported Windows path; set `BROWSER_PATH` for another Chromium installation. When no browser is available, the browser test is reported as skipped.

## Files

- `public/`: browser UI, responsive styles, regional geometry, and assets.
- `server.mjs`: Node HTTP server, SQLite schema, sessions, and JSON API.
- `tests/`: isolated integration tests.

## Photo attribution

Ashgabat photos by Bayram A, licensed under CC BY-SA 4.0:

- https://commons.wikimedia.org/wiki/File:Apartment_blocks_Ashgabat.jpg
- https://commons.wikimedia.org/wiki/File:Ashgabat_apartment_blocks2.jpg

Region boundaries: geoBoundaries (https://www.geoboundaries.org/). Attribution links remain available in the UI.
