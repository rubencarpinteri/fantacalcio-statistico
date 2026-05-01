# Fantacalcio Statistico — Claude Context

Full-stack Italian Mantra-style fantasy football app. Private league, statistics-based scoring.

## Stack
- Next.js 15 App Router, React 19.2, TypeScript strict (`noUncheckedIndexedAccess: true`)
- Tailwind CSS v4, Supabase (`@supabase/ssr` exclusively), Zod for server validation
- Deployment: Vercel (`https://fantacalcio-statistico.vercel.app`) + Supabase project `yqaxcpkjqvtroxinjjvw` (fantamorto-league)
- GitHub: `https://github.com/rubencarpinteri/fantacalcio-statistico`

## Key Rules
- Always write code in English (comments, variables, types). UI strings stay Italian.
- No component libraries — custom Tailwind components only
- **Theming:** light by default, dark via `.dark` on `<html>` (toggled by `components/ui/ThemeToggle.tsx`, persisted in `localStorage.theme`, applied pre-paint by inline boot script in `app/layout.tsx`)
- Use semantic CSS-var-driven utilities (`text-ink-1..5`, `bg-glass-1..3`, `bg-surface-0..3`, `border-hairline`, `border-hairline-strong`, `divide-hairline`) so colors auto-flip with the active theme. Avoid hardcoded hex (`text-[#f5f7ff]`) or `bg-white/[0.0x]` overlays.
- Keep `text-white` only when text sits on a saturated colored background (indigo/emerald/rose CTA buttons); otherwise use `text-ink-1`.
- Squarer radii: sm 4px, md 6px, lg 8px, xl 10px, 2xl 12px (defined in `app/globals.css` `@theme`).
- Use `useActionState` from `react` (NOT `useFormState` from `react-dom`)
- `cookies()` from `next/headers` must be awaited (returns Promise in Next.js 15)

## Architecture
- `profiles.is_super_admin` — no role field on profiles
- League roles in `league_users.role` (enum: `league_admin | manager`)
- `lineup_submissions` is APPEND-ONLY — never update rows
- `rating_class` stored explicitly on `league_players`, NEVER derived at runtime
- `resolveRatingClass()` is import-time only — `domain/roles/resolveRatingClass.ts`

## Engine v1.2 (dual-source)
- Sources: FotMob (weight 55%) + SofaScore (weight 45%)
- z_fotmob = (rating − mean_fm) / std_fm  [defaults: mean=6.6, std=0.79]
- z_sofascore = (rating − mean_ss) / std_ss  [defaults: mean=6.6, std=0.65]
- No single-source shrink in v1.2 (removed from v1.1)
- All normalization params configurable per league in `league_engine_config`
- SofaScore fetched server-side: `api.sofascore.com/api/v1/event/{id}/lineups` in POST `/api/ratings/fetch`
  → ID matching via `serie_a_players.sofascore_id` chain (no name matching)

## Supabase patterns
- Server client: `createClient()` in `lib/supabase/server.ts` (async, per-request)
- Browser client: `createBrowserClient` in `lib/supabase/client.ts`
- Middleware refreshes token via `supabase.auth.getUser()` (NOT `getSession()`)

## Data files
- `_data/SerieAcalendar2526.csv` — match schedule with FotMob + SofaScore match IDs per round
- `_data/people.csv` — 421k-row cross-platform player ID map (key_sofascore col 13, key_fotmob col 22)
