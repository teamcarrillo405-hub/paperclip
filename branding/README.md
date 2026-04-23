# Branding Assets

This directory contains the operator-controlled branding assets for the
whitelabel deployment. The server mounts this directory at `/branding/*` so
paths referenced from `whitelabel.config.ts` (at the repo root) are served
directly to the browser.

## Files

- `favicon.ico` — browser tab icon. Drop in your own `.ico` to replace.
- `logo.svg` — wordmark/logo used in headers and auth pages. Replace with
  your own SVG (a square viewBox works best).

## Updating

1. Replace the files in this directory with your own assets. Keep the
   filenames or update `whitelabel.config.ts` to match.
2. Restart the server. The config is cached at startup.
3. Verify by loading the app and checking the tab title, favicon, and any
   page that uses the logo.

## Config reference

Edit `whitelabel.config.ts` at the repo root to change the product name,
colors, support email, and other strings. The React UI consumes these
values via `/api/brand` at runtime, so no rebuild is required when only
textual values change — a server restart is enough.
