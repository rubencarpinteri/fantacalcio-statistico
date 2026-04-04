-- Replace leghe_name (single text) with leghe_names (text array) for multi-alias support.
-- This allows one team to be recognised by multiple Leghe.it display names.

alter table fantasy_teams
  add column if not exists leghe_names text[] not null default '{}';

-- Migrate any existing single alias to the new array column.
update fantasy_teams
  set leghe_names = array[leghe_name]
  where leghe_name is not null;

-- UDB / SquadraDabbattere / Uomodabbattare are all the same team — store all variants.
-- Match via the previously-migrated alias OR by the team's own name.
update fantasy_teams
  set leghe_names = array['SquadraDabbattere', 'Uomodabbattare', 'UDB']
  where 'SquadraDabbattere' = any(leghe_names)
     or lower(name) in ('udb', 'uomodabbattare', 'squadradabbattere');

alter table fantasy_teams drop column if exists leghe_name;

comment on column fantasy_teams.leghe_names is
  'Leghe.it display names used to auto-match teams during text lineup imports (multiple aliases supported)';
