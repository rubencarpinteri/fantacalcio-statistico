-- Persist the engine's per-player breakdown alongside live_player_scores so
-- pages reading this table during 'open' matchdays can show bonus/malus
-- chips and z-scores in real time, matching the post-match player_calculations
-- view. Without these columns the live overlay only had voto_base and
-- fantavoto, hiding why a player got the score.

alter table live_player_scores
  add column if not exists bonus_malus_breakdown jsonb,
  add column if not exists z_fotmob numeric,
  add column if not exists z_sofascore numeric,
  add column if not exists minutes_factor numeric,
  add column if not exists role_multiplier numeric;
