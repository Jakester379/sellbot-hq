# Sellbot HQ

A Toontown-inspired sales progression dashboard. Static site for GitHub Pages, with optional cloud sync through Supabase.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup and the animated skyline |
| `styles.css` | All styling |
| `app.js` | All logic: ladder, deals, merits, rewards, sync |
| `config.js` | **Yours, not included.** Your Supabase URL and publishable key. Keep your existing one. |
| `config.example.js` | Template for `config.js` |
| `favicon.png` | **Yours, not included.** Keep your existing one. |
| `manifest.webmanifest` + `assets/icon-*.png` | Lets you "Add to Home Screen" on your phone as an app |
| `assets/*.webp`, `assets/suit-texture.jpg` | Cloud, mist and suit images (previously embedded in the HTML) |
| `supabase/schema.sql` | Table + row-level security policies |

## Deploy

1. Copy everything in this folder into your GitHub Pages repo, replacing the old `index.html`. Keep your existing `config.js` and `favicon.png`.
2. In Supabase → SQL Editor, run `supabase/schema.sql`. It's safe on your existing table: it adds row-level security if it's missing and won't touch your data.
3. Commit and push. Open the site and sign in — your old data upgrades automatically.

## What happens to existing data

- Your old cumulative MRR becomes a single **"Opening balance"** deal dated today. Edit the date (delete and re-log it) if you want the promotion log to reflect when you actually got there.
- Open **Settings** and set your **goal start date** so the pace marker is accurate.
- The old single-file version can still read the new save (key fields are mirrored), so rolling back is safe.

## Backups

Settings → **Export JSON** downloads everything. Import restores it. When cloud and browser copies conflict, the older copy is saved in `localStorage` under `sellbotDash_cloudBackup` or `sellbotDash_localBackup`.
