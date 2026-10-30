# RendaFacil

> **TODO:** one-sentence description of what this app does and who it is for.

A Vue 3 single-page app that installs as a Progressive Web App, with a Supabase client ready to be connected.

Sections marked **TODO** are documentation placeholders — fill them in as the project takes shape.

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Progressive Web App](#progressive-web-app)
- [Supabase](#supabase)
- [Customising the template](#customising-the-template)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

> **TODO:** describe the problem the app solves, its main users, and the current status of the project (prototype, beta, production).

## Features

What the template ships with today:

- Four sample pages (Home, User, Settings, Info) behind a glass-style bottom navigation island
- Responsive layout for phone and desktop, with light and dark themes that follow the system setting
- Installable as a PWA, with offline caching of the app shell
- Supabase client, typed schema placeholder and an auth store, inactive until credentials are added

> **TODO:** replace this list with the product's real features.

## Tech stack

| Area       | Tool                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| Framework  | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)                     |
| Language   | [TypeScript](https://www.typescriptlang.org/)                                       |
| Build tool | [Vite](https://vite.dev/)                                                           |
| Routing    | [Vue Router](https://router.vuejs.org/)                                             |
| State      | [Pinia](https://pinia.vuejs.org/)                                                   |
| PWA        | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox)                      |
| Backend    | [Supabase](https://supabase.com/) via `@supabase/supabase-js` _(not yet connected)_ |
| Quality    | ESLint, Prettier, `vue-tsc`                                                         |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) `20.19` or newer (`22.13+` or `24+` also work)
- npm (bundled with Node.js)

### Install

```bash
npm install
```

### Environment variables

The app reads its configuration from `.env`. That file is git-ignored, so on a fresh clone create it from the example:

```bash
cp .env.example .env
```

| Variable                        | Required | Description                        |
| ------------------------------- | -------- | ---------------------------------- |
| `VITE_SUPABASE_URL`             | No\*     | Supabase project URL               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No\*     | Supabase publishable (or anon) key |

\* The app runs without them; they are only needed once you start using Supabase. See [Supabase](#supabase).

Restart the dev server after changing `.env`.

### Run

```bash
npm run dev
```

This starts the dev server and opens the app in your browser at <http://localhost:5173> (Vite picks the next free port if 5173 is taken — the URL is printed in the terminal). Edits to the source hot-reload.

To try the app from a phone on the same Wi-Fi network:

```bash
npm run dev -- --host
```

Then open the "Network" URL that Vite prints. Note that installing the PWA does not work over a plain `http://192.168…` address — see [Requirements](#requirements).

## Available scripts

| Command                       | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `npm run dev`                 | Start the dev server with hot reload and open the browser       |
| `npm run build`               | Type-check, then build for production into `dist/`              |
| `npm run preview`             | Serve the production build locally                              |
| `npm run type-check`          | Type-check the project with `vue-tsc`                           |
| `npm run lint`                | Lint with ESLint and fix what can be fixed automatically        |
| `npm run format`              | Format `src/` with Prettier                                     |
| `npm run generate-pwa-assets` | Regenerate the app icons in `public/` from `public/favicon.svg` |

## Project structure

```text
├── public/                  Static files copied as-is (favicon and PWA icons)
├── src/
│   ├── assets/main.css      Global styles and design tokens (colours, glass effect)
│   ├── components/
│   │   ├── AppIcon.vue      Inline SVG icons
│   │   ├── BottomNav.vue    Glass navigation island
│   │   └── PageCard.vue     Glass card used by every sample page
│   ├── composables/
│   │   └── usePwaInstall.ts In-app "Install app" button logic
│   ├── lib/supabase.ts      Supabase client
│   ├── router/index.ts      Route definitions
│   ├── stores/auth.ts       Pinia store tracking the Supabase session
│   ├── types/
│   │   └── database.types.ts  Supabase schema types (placeholder until generated)
│   ├── views/               One component per page
│   ├── App.vue              App shell: page outlet + bottom nav
│   └── main.ts              Entry point
├── .env.example             Template for the environment variables
├── index.html               HTML entry point
├── pwa-assets.config.ts     Icon generation settings
└── vite.config.ts           Vite and PWA (manifest, service worker) settings
```

Imports can use `@/` as a shortcut for `src/`, e.g. `import PageCard from '@/components/PageCard.vue'`.

## Progressive Web App

The PWA setup lives in `vite.config.ts`. `vite-plugin-pwa` generates two things:

- a **web app manifest** (name, colours, icons), which is what makes the app installable;
- a **service worker** that caches the built files, so the app shell loads offline and on repeat visits.

Updates are automatic: when a new version is deployed, the service worker downloads it in the background and it takes effect the next time the app is opened.

### Requirements

Browsers only offer installation when the app is served from **HTTPS** or from **`localhost`**. A phone opening `http://192.168.x.x:5173` on your network will show the app but will not offer to install it — deploy to an HTTPS host (or use an HTTPS tunnel) to install on a phone.

### Installing the app

**Desktop — Chrome or Edge**

1. Open the app's URL.
2. Click the **Install** icon at the right end of the address bar, or press the **Install app** button on the Home page.
3. Confirm with **Install**. The app opens in its own window and gets a shortcut in the Start menu / Launchpad.

If the icon isn't there, use the browser menu: **⋮ → Cast, save and share → Install page as app…** (Chrome) or **… → Apps → Install this site as an app** (Edge).

**Android — Chrome**

1. Open the app's URL.
2. Tap the **Install app** button on the Home page, or **⋮ → Add to Home screen → Install**.
3. The app appears on the home screen and in the app drawer.

**iPhone and iPad — Safari**

1. Open the app's URL in Safari.
2. Tap the **Share** button.
3. Scroll down and tap **Add to Home Screen**, then **Add**.

iOS has no install prompt, so the in-app button never appears there — the Share menu is the only route.

**Mac — Safari**

1. Open the app's URL in Safari.
2. Choose **File → Add to Dock…**, then **Add**.

**Uninstalling**: on desktop, open the installed app and choose **⋮ → Uninstall**; on mobile, remove it like any other app.

### Testing the PWA locally

`npm run dev` already serves the manifest and a service worker, so the install option shows up on `localhost` during development. An app installed that way points at the dev server and only works while it is running.

To test the real thing — the production service worker with full offline caching — build and preview instead:

```bash
npm run build
```

```bash
npm run preview
```

### Changing the icon

1. Replace `public/favicon.svg` with your logo (a square SVG with a transparent background works best).
2. Run `npm run generate-pwa-assets` to regenerate the PNG and ICO files in `public/`.

The solid backdrop used for the home-screen icons is set in `pwa-assets.config.ts`.

## Supabase

Everything needed on the app side is in place, but nothing talks to Supabase until credentials are added. Until then the app runs normally and the **Perfil** page offers visitor access, with account registration and sign-in unavailable.

### Connecting a project

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. In the dashboard, open **Project Settings → API** and copy the **Project URL** and the **publishable** key (older projects call it the `anon` key — either works).
3. Paste them into `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. In **Authentication → URL Configuration**, set the Site URL and allow the profile redirect URL (`http://localhost:5173/user` for local development, plus the deployed app's `/user` URL). Include the base path if the app is hosted in a subdirectory.
5. Enable the Email provider and configure confirmation emails. Restart the dev server; **Perfil** now offers **Entrar** and **Criar conta**.

> **Security:** every `VITE_` variable is bundled into the code sent to the browser. Only the publishable key belongs here — never a `secret` / `service_role` key. Protect your data with [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) policies on every table.

### Using the client

```ts
import { getSupabase } from '@/lib/supabase'

const { data, error } = await getSupabase().from('your_table').select()
```

`getSupabase()` returns one shared client, created the first time it is called. It throws a descriptive error if the environment variables are missing; check `isSupabaseConfigured` (same module) first if a code path must work without Supabase.

### Authentication

[The auth store](src/stores/auth.ts) listens for auth changes and exposes `session`, `user`, `ready` and `isGuest`, plus actions for sign-in, registration, profile updates and sign-out. Both signed-out visitors and anonymous Supabase users are shown as visitors.

[The profile page](src/views/UserView.vue) displays and edits name, email and optional contact phone. Names and phones are saved in Supabase Auth user metadata (`full_name`, `phone`), so no extra database table or migration is required. These are profile details, never authorization claims. Contact phone edits do not change the phone identity used for SMS authentication.

Email changes use `auth.updateUser` and keep showing the current email until Supabase confirms the new address. With Secure Email Change enabled, follow the confirmation messages sent to both addresses. Registration also handles projects that require email confirmation before a session is created.

Example store usage:

The profile also lists dependents saved in the income store, including those without income, and
offers password changes (current password, new password, confirmation), sign-out and permanent
account deletion with a centered confirmation dialog. Income and dependents currently live only
in memory for the current session; they are cleared when an authenticated account signs out or
changes. They are not yet synchronized to a database or retained after a page reload.

Account deletion requires deploying [the delete-account Edge Function](supabase/functions/delete-account/index.ts)
to the same Supabase project used by the frontend:

```bash
npx supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

The function validates the bearer token using `auth.getUser`, rejects anonymous users, revokes
sessions and deletes only the authenticated user via the Admin API. `--no-verify-jwt` bypasses
the gateway's legacy JWT check; authentication is still required and checked inside the function.
Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Never add
the service role key to frontend environment variables. Until this function is deployed, account
deletion shows an error and does not report success. Future database tables and storage objects
owned by a user must have an explicit cleanup policy before being added to this deletion flow.
Existing access tokens expire naturally even after sessions are revoked; sensitive future APIs
must check the live user/session rather than relying on a JWT signature alone.

Verify on a disposable test account: cancel deletion and confirm the account still works, then
confirm deletion and verify the account can no longer sign in. Password tests should confirm that
an incorrect current password fails and that only the new password works after a successful change.

```ts
const auth = useAuthStore()
await auth.signIn(email, password)
await auth.signOut()
```

```ts
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const { user } = storeToRefs(useAuthStore())
```

Run `npm test` for profile validation and the account lifecycle tests. They exercise the auth store and Supabase SDK with isolated HTTP fixtures and never contact a real project. To verify the live integration after configuring credentials: create and confirm an account, edit the name and phone, reload, request an email change, confirm it, and sign out.

### Typed queries

`src/types/database.types.ts` is an empty placeholder, so TypeScript will reject table names until you generate the real types from your schema:

```bash
npx supabase login
```

```bash
npx supabase gen types typescript --project-id your-project-ref > src/types/database.types.ts
```

On Windows, run the second command from Command Prompt, Git Bash or PowerShell 7+: the older Windows PowerShell 5.1 saves `>` output as UTF-16, which Vite and ESLint can't parse. Re-run it whenever the schema changes.

### Offline behaviour

The service worker caches the app's own files only. Requests to Supabase always go to the network, so data is not available offline unless you add caching for it deliberately.

> **TODO:** document the database schema, RLS policies and auth providers once they exist.

## Customising the template

| To change…        | Edit                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| App name          | `index.html` (`<title>`, description), the `manifest` block in `vite.config.ts`, `src/views/HomeView.vue`, and `name` in `package.json` |
| Colours and glass | The variables at the top of `src/assets/main.css` (light values first, dark overrides below)                                            |
| Browser/OS chrome | `theme-color` tags in `index.html`; `theme_color` and `background_color` in `vite.config.ts`                                            |
| Navigation items  | The `items` list in `src/components/BottomNav.vue`, plus a route in `src/router/index.ts` and an icon in `src/components/AppIcon.vue`   |
| Page content      | The files in `src/views/`                                                                                                               |

## Architecture

> **TODO:** describe how the app is put together — main data flows, key stores, how the client talks to Supabase, and any decisions worth recording.

## Deployment

`npm run build` produces a static site in `dist/` that any static host can serve. Whatever the host, three things matter:

- **HTTPS** — required for the service worker and for installation.
- **SPA fallback** — the router uses clean URLs (`/settings`, not `/#/settings`), so the host must serve `index.html` for unknown paths. Most hosts have a setting or a rewrite rule for this.
- **Environment variables** — set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host's build settings; they are read at build time.

> **TODO:** record the hosting provider, production URL, and the release process.

## Troubleshooting

**The browser keeps showing an old version on `localhost`.** A service worker from an earlier session is still serving cached files. Open DevTools → **Application → Service workers → Unregister**, then reload. To keep service workers out of development altogether, set `devOptions.enabled` to `false` in `vite.config.ts` (the app will then only be installable from a production build).

**No install option appears.** Check that the page is on HTTPS or `localhost`, that it isn't already installed, and that you're not in a private/incognito window.

**`Supabase is not configured` error.** `.env` is missing one of the two variables, or the dev server wasn't restarted after editing it.

## Contributing

> **TODO:** branching model, commit conventions, and review process. Run `npm run lint` and `npm run type-check` before opening a pull request.

## License

> **TODO:** choose a license, or state that the project is proprietary.
