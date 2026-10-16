# Sellbot HQ — Cloud Edition

This is your original Sellbot HQ dashboard upgraded for multi-device cloud saving.

## Stack
- Static website: GitHub Pages
- Auth + database: Supabase
- Frontend: the existing single-file HTML dashboard

## One-time setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase_setup.sql`.
3. In Supabase, get the Project URL and Publishable Key.
4. Put them into `config.js`.
5. Put `index.html` and `config.js` in a GitHub repository.
6. Enable GitHub Pages for the repository (Settings → Pages → Deploy from branch → main → /(root)).
7. Open the published site, create an account, and sign in.

## Important
Use the Supabase *publishable* key in `config.js`, never the `service_role` key.

The site uses Supabase Auth plus Row Level Security so each signed-in user can only access their own Sellbot profile row.

## Existing behavior
The original rank ladder, merit calculations, SOS reward deck, Hollywood jackpot, weekly report, and visual design are preserved. Local browser storage remains as a temporary fallback during setup, while signed-in users sync to the cloud.
