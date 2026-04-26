# Avero Enterprise Mobile

React Native (Expo SDK 51) mobile app for the Avero Enterprise platform.
Supports iOS 16+ and Android 10+ (API 29+).

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- iOS: Xcode 15+ with iOS Simulator
- Android: Android Studio with an emulator or a physical device

## Setup

```bash
cd mobile
npm install
```

Add a `1024x1024` icon PNG at `assets/icon.png` (see `assets/PLACEHOLDER.md` for full asset list).

## Environment

Create a `.env` file (gitignored) to point at your backend:

```
EXPO_PUBLIC_API_URL=http://localhost:3100
```

The default value is `http://localhost:3100` — no `.env` needed for local development.

## Running

```bash
# Start Metro bundler (scan QR with Expo Go)
npm start

# Open on iOS Simulator
npm run ios

# Open on Android Emulator
npm run android
```

## Architecture

| Layer | Technology |
|---|---|
| Framework | Expo SDK 51, React Native 0.74 |
| Navigation | React Navigation 6 (stack + bottom tabs) |
| Data fetching | TanStack React Query v5 |
| Auth storage | expo-secure-store (Keychain / EncryptedSharedPreferences) |
| Push notifications | expo-notifications (FCM + APNS) |
| Type safety | TypeScript 5 strict mode |

## Project structure

```
src/
  api/          API client + per-resource modules
  components/   Shared UI components
  context/      Auth + Company React contexts
  hooks/        TanStack Query hooks per resource
  navigation/   Root, Auth, and Main (tab) navigators
  screens/      All screen components
  config.ts     Environment variables
  theme.ts      Design tokens (colors, spacing, typography)
App.tsx         Entry point — providers + push notification setup
```

## Screens

| Screen | Tab | Description |
|---|---|---|
| LoginScreen | Auth | Email/password sign-in with Avero branding |
| DashboardScreen | Dashboard | Metrics + recent issues overview |
| IssuesScreen | Issues | Searchable, filterable issues list |
| IssueDetailScreen | Issues | Detail view + activity thread + comment input |
| AgentsScreen | Agents | Grid of available AI agents |
| ChatScreen | Agents | Full-screen chat interface per agent |
| ProfileScreen | Profile | User info + company switcher + sign out |

## Design tokens

| Token | Value |
|---|---|
| Background | `#18181b` (zinc-900) |
| Surface/card | `#27272a` (zinc-800) |
| Border | `#3f3f46` (zinc-700) |
| Primary gold | `#F5C518` |
| Text primary | `#fafafa` |
| Text muted | `#a1a1aa` |

## API

Points to `EXPO_PUBLIC_API_URL/api` (default: `http://localhost:3100/api`).
All authenticated requests include `Authorization: Bearer <token>`.
Token stored under key `avero.token` in the device secure store.
