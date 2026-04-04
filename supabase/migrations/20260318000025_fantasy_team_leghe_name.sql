-- Add leghe_name to fantasy_teams for automatic Leghe.it text import name mapping.
-- When a Leghe team name doesn't match the DB team name, the admin can assign an alias
-- once and all future imports will auto-map it.
alter table fantasy_teams add column if not exists leghe_name text;

comment on column fantasy_teams.leghe_name is
  'Optional Leghe.it display name used to auto-match teams during text lineup imports';
