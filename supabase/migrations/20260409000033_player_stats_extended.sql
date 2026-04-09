-- Extended player match stats: all SofaScore lineups fields
alter table player_match_stats
  -- Advanced metrics
  add column if not exists xg                     float8  null,
  add column if not exists xa                     float8  null,
  add column if not exists blocked_scoring_attempt int     null,
  -- Passing
  add column if not exists total_passes           int     null,
  add column if not exists accurate_passes        int     null,
  add column if not exists total_long_balls       int     null,
  add column if not exists accurate_long_balls    int     null,
  add column if not exists total_crosses          int     null,
  -- Duels
  add column if not exists duel_won               int     null,
  add column if not exists duel_lost              int     null,
  add column if not exists aerial_won             int     null,
  add column if not exists aerial_lost            int     null,
  add column if not exists total_tackles          int     null,
  -- Ball carrying / possession
  add column if not exists touches               int     null,
  add column if not exists ball_recoveries       int     null,
  add column if not exists ball_carries          int     null,
  add column if not exists progressive_carries   int     null,
  add column if not exists dispossessed          int     null,
  add column if not exists possession_lost_ctrl  int     null,
  -- Fouls
  add column if not exists fouls_committed       int     null,
  add column if not exists was_fouled            int     null,
  -- Player snapshot (from SofaScore player object)
  add column if not exists market_value          bigint  null,
  add column if not exists height                int     null;
