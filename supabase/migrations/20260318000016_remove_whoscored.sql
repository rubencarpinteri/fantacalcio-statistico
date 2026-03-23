-- Remove WhoScored from the data model.
-- WhoScored blocks all automated fetching; only SofaScore + FotMob are supported.

alter table player_match_stats
  drop column if exists whoscored_rating;

alter table player_calculations
  drop column if exists z_whoscored;

alter table leagues
  drop column if exists source_weight_whoscored;

-- Rebalance existing leagues: redistribute the whoscored weight proportionally
-- to sofascore and fotmob so they still sum to 100.
-- Default split: sofascore=55, fotmob=45.
update leagues
set
  source_weight_sofascore = case
    when source_weight_sofascore + source_weight_fotmob = 0 then 55
    else round(source_weight_sofascore::numeric / nullif(source_weight_sofascore + source_weight_fotmob, 0) * 100)
  end,
  source_weight_fotmob = case
    when source_weight_sofascore + source_weight_fotmob = 0 then 45
    else 100 - round(source_weight_sofascore::numeric / nullif(source_weight_sofascore + source_weight_fotmob, 0) * 100)
  end;
