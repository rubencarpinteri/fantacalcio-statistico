-- Migration 020: accent-insensitive search for serie_a_players
-- Adds a generated column `search_name` = lower(unaccent(full_name))
-- so that typing "osti" matches "Østigård", "kean" matches "Moïse Kean", etc.

create extension if not exists unaccent;

alter table serie_a_players
  add column if not exists search_name text
  generated always as (lower(unaccent(full_name))) stored;

create index if not exists idx_serie_a_players_search_name
  on serie_a_players (search_name text_pattern_ops);
