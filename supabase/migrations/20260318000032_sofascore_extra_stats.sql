-- Add shooting / dribbling stats columns to player_match_stats.
-- Defending / passing columns (tackles_won, interceptions, clearances, blocks,
-- key_passes, successful_dribbles) already exist in the initial schema.
-- These new columns are populated from the SofaScore fantasy endpoint.

alter table player_match_stats
  add column if not exists shots              int not null default 0,
  add column if not exists shots_on_target    int not null default 0,
  add column if not exists big_chance_created int not null default 0,
  add column if not exists big_chance_missed  int not null default 0,
  add column if not exists dribble_attempts   int not null default 0;
