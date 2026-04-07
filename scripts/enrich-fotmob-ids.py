#!/usr/bin/env python3
"""
Enrich league_players.fotmob_player_id from the Reep people.csv dataset.

Usage:
  python3 scripts/enrich-fotmob-ids.py [--dry-run]

Requirements:
  pip install supabase

The script:
  1. Reads _data/people.csv (semicolon-delimited, Reep format)
  2. Filters rows that have BOTH key_serie_a AND key_fotmob populated
  3. Normalises names (lowercase, strip accents, strip non-alpha)
  4. Fetches all league_players from Supabase
  5. Matches by normalised name
  6. Updates fotmob_player_id for matched players (skips already-set ones)
  7. Prints a summary of matches, skips, and unmatched players

Environment variables required:
  SUPABASE_URL   — your project URL  (e.g. https://xxx.supabase.co)
  SUPABASE_KEY   — service_role key  (NOT the anon key — needs UPDATE access)
"""

import csv
import os
import re
import sys
import unicodedata
from typing import Optional

# ── optional dry-run flag ────────────────────────────────────────────────────
DRY_RUN = '--dry-run' in sys.argv


def normalize(name: str) -> str:
    """Lowercase, strip diacritics, keep only a-z and spaces."""
    nfkd = unicodedata.normalize('NFKD', name.lower())
    ascii_str = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r'[^a-z ]', '', ascii_str).strip()


def load_pool(csv_path: str) -> dict[str, int]:
    """
    Parse people.csv and return a dict of {normalised_name: fotmob_id}
    for every player that has both key_serie_a and key_fotmob set.
    """
    pool: dict[str, int] = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            if row.get('key_serie_a', '').strip() and row.get('key_fotmob', '').strip():
                name = row.get('name', '').strip()
                fotmob_id = int(row['key_fotmob'].strip())
                norm = normalize(name)
                pool[norm] = fotmob_id
    return pool


def main() -> None:
    # ── locate people.csv ────────────────────────────────────────────────────
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    csv_path = os.path.join(project_root, '_data', 'people.csv')

    if not os.path.exists(csv_path):
        print(f'ERROR: people.csv not found at {csv_path}')
        sys.exit(1)

    pool = load_pool(csv_path)
    print(f'Pool loaded: {len(pool)} Serie A players with FotMob IDs')

    # ── Supabase client ──────────────────────────────────────────────────────
    try:
        from supabase import create_client, Client
    except ImportError:
        print('ERROR: supabase package not installed. Run: pip install supabase')
        sys.exit(1)

    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_KEY')
    if not url or not key:
        print('ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables.')
        sys.exit(1)

    supabase: Client = create_client(url, key)

    # ── fetch all league_players ─────────────────────────────────────────────
    response = supabase.table('league_players').select('id,full_name,fotmob_player_id').execute()
    players = response.data or []
    print(f'Fetched {len(players)} league_players from DB')

    # ── match & collect updates ──────────────────────────────────────────────
    updates: list[tuple[str, int, str]] = []   # (id, fotmob_id, full_name)
    already_set: list[str] = []
    no_match: list[str] = []

    for p in players:
        if p['fotmob_player_id'] is not None:
            already_set.append(p['full_name'])
            continue
        norm = normalize(p['full_name'])
        if norm in pool:
            updates.append((p['id'], pool[norm], p['full_name']))
        else:
            no_match.append(p['full_name'])

    print(f'\nResults:')
    print(f'  Already set:  {len(already_set)}')
    print(f'  Will update:  {len(updates)}')
    print(f'  No match:     {len(no_match)}')

    if DRY_RUN:
        print('\n[DRY RUN] No changes written. Matches that would be applied:')
        for uid, fotmob_id, name in updates:
            print(f'  {name} → {fotmob_id}')
        return

    # ── apply updates ────────────────────────────────────────────────────────
    if not updates:
        print('Nothing to update.')
        return

    updated = 0
    errors = 0
    for uid, fotmob_id, name in updates:
        res = (
            supabase.table('league_players')
            .update({'fotmob_player_id': fotmob_id})
            .eq('id', uid)
            .execute()
        )
        if res.data:
            updated += 1
        else:
            print(f'  WARN: update failed for {name} ({uid})')
            errors += 1

    print(f'\nDone. Updated: {updated}  Errors: {errors}')

    if no_match:
        print(f'\nPlayers with no FotMob match in people.csv ({len(no_match)}):')
        for n in sorted(no_match):
            print(f'  - {n}')


if __name__ == '__main__':
    main()
