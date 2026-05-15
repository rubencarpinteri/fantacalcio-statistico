-- ============================================================
-- Migration 041 — FantaMondiale Statistico: RLS policies
-- ============================================================
-- STRATEGY:
--   * super_admin (profiles.is_super_admin = true) bypasses all
--     restrictions. There is currently no per-competition admin
--     role — one global admin runs the whole tournament.
--   * Any authenticated user can read public competition data
--     (competition, phases, teams, players, coaches, prices,
--     schedule, fixtures, standings, audit-public events).
--   * Squad and lineup secrecy is the core privacy mechanic:
--       - Own squad/lineup: always readable by the owner.
--       - Other users' squad: readable only after the parent
--         phase reaches status='locked' or beyond.
--       - Other users' lineup: readable only after the parent
--         scoring round reaches status='locked' or beyond.
--   * Scoring details (player/coach scores, BR matchups, round
--     scores) are readable only after the round is published.
--   * Audit log: super_admin only.
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function fm_is_competition_member(p_competition_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fm_fantasy_team
    where competition_id = p_competition_id
      and manager_id = auth.uid()
  )
$$;

create or replace function fm_get_user_team_id(p_competition_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from fm_fantasy_team
  where competition_id = p_competition_id
    and manager_id = auth.uid()
  limit 1
$$;

create or replace function fm_phase_is_revealed(p_phase_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fm_phase
    where id = p_phase_id
      and status in ('locked', 'completed')
  )
$$;

create or replace function fm_round_is_revealed(p_round_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fm_scoring_round
    where id = p_round_id
      and status in ('locked', 'scoring', 'published')
  )
$$;

create or replace function fm_round_is_published(p_round_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fm_scoring_round
    where id = p_round_id
      and status = 'published'
  )
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================

alter table fm_competition              enable row level security;
alter table fm_competition_config       enable row level security;
alter table fm_national_team            enable row level security;
alter table fm_player                   enable row level security;
alter table fm_coach                    enable row level security;
alter table fm_phase                    enable row level security;
alter table fm_phase_player_price       enable row level security;
alter table fm_phase_coach_tier         enable row level security;
alter table fm_scoring_round            enable row level security;
alter table fm_real_match               enable row level security;
alter table fm_fantasy_team             enable row level security;
alter table fm_phase_squad              enable row level security;
alter table fm_phase_squad_player       enable row level security;
alter table fm_matchday_lineup          enable row level security;
alter table fm_matchday_lineup_player   enable row level security;
alter table fm_round_player_ownership   enable row level security;
alter table fm_player_match_stats       enable row level security;
alter table fm_player_match_score       enable row level security;
alter table fm_coach_match_score        enable row level security;
alter table fm_fantasy_team_round_score enable row level security;
alter table fm_battle_royale_matchup    enable row level security;
alter table fm_competition_standing     enable row level security;
alter table fm_audit_log                enable row level security;

-- ============================================================
-- PUBLIC-READ TABLES
-- (Anyone authenticated can read; only super_admin can write.)
-- ============================================================

-- fm_competition
create policy "fm_competition: auth read"
  on fm_competition for select
  to authenticated
  using (true);
create policy "fm_competition: super_admin write"
  on fm_competition for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_competition_config
create policy "fm_competition_config: auth read"
  on fm_competition_config for select
  to authenticated
  using (true);
create policy "fm_competition_config: super_admin write"
  on fm_competition_config for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_national_team
create policy "fm_national_team: auth read"
  on fm_national_team for select
  to authenticated
  using (true);
create policy "fm_national_team: super_admin write"
  on fm_national_team for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_player
create policy "fm_player: auth read"
  on fm_player for select
  to authenticated
  using (true);
create policy "fm_player: super_admin write"
  on fm_player for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_coach
create policy "fm_coach: auth read"
  on fm_coach for select
  to authenticated
  using (true);
create policy "fm_coach: super_admin write"
  on fm_coach for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_phase
create policy "fm_phase: auth read"
  on fm_phase for select
  to authenticated
  using (true);
create policy "fm_phase: super_admin write"
  on fm_phase for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_phase_player_price
create policy "fm_phase_player_price: auth read"
  on fm_phase_player_price for select
  to authenticated
  using (true);
create policy "fm_phase_player_price: super_admin write"
  on fm_phase_player_price for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_phase_coach_tier
-- Tiers are admin-curated and not strategically sensitive once
-- the phase opens; we expose them to authenticated users.
create policy "fm_phase_coach_tier: auth read"
  on fm_phase_coach_tier for select
  to authenticated
  using (true);
create policy "fm_phase_coach_tier: super_admin write"
  on fm_phase_coach_tier for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_scoring_round
create policy "fm_scoring_round: auth read"
  on fm_scoring_round for select
  to authenticated
  using (true);
create policy "fm_scoring_round: super_admin write"
  on fm_scoring_round for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_real_match
create policy "fm_real_match: auth read"
  on fm_real_match for select
  to authenticated
  using (true);
create policy "fm_real_match: super_admin write"
  on fm_real_match for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_fantasy_team
create policy "fm_fantasy_team: auth read"
  on fm_fantasy_team for select
  to authenticated
  using (true);
create policy "fm_fantasy_team: super_admin write"
  on fm_fantasy_team for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_competition_standing
create policy "fm_competition_standing: auth read"
  on fm_competition_standing for select
  to authenticated
  using (true);
create policy "fm_competition_standing: super_admin write"
  on fm_competition_standing for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- PHASE SQUAD
-- Owner reads own draft squad; others see it only after the
-- parent phase enters 'locked'. Owner can mutate while
-- own row is in 'draft' status; super_admin can always write.
-- ============================================================

create policy "fm_phase_squad: own read"
  on fm_phase_squad for select
  to authenticated
  using (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
  );

create policy "fm_phase_squad: revealed read"
  on fm_phase_squad for select
  to authenticated
  using (fm_phase_is_revealed(phase_id));

create policy "fm_phase_squad: super_admin read"
  on fm_phase_squad for select
  to authenticated
  using (is_super_admin());

create policy "fm_phase_squad: own write while draft"
  on fm_phase_squad for insert
  to authenticated
  with check (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status = 'draft'
  );

create policy "fm_phase_squad: own update while draft"
  on fm_phase_squad for update
  to authenticated
  using (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status in ('draft', 'submitted')
  )
  with check (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status in ('draft', 'submitted')
  );

create policy "fm_phase_squad: super_admin write"
  on fm_phase_squad for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_phase_squad_player
create policy "fm_phase_squad_player: own read"
  on fm_phase_squad_player for select
  to authenticated
  using (
    phase_squad_id in (
      select s.id from fm_phase_squad s
      join fm_fantasy_team t on t.id = s.fantasy_team_id
      where t.manager_id = auth.uid()
    )
  );

create policy "fm_phase_squad_player: revealed read"
  on fm_phase_squad_player for select
  to authenticated
  using (
    phase_squad_id in (
      select s.id from fm_phase_squad s
      where fm_phase_is_revealed(s.phase_id)
    )
  );

create policy "fm_phase_squad_player: super_admin read"
  on fm_phase_squad_player for select
  to authenticated
  using (is_super_admin());

create policy "fm_phase_squad_player: own write while draft"
  on fm_phase_squad_player for all
  to authenticated
  using (
    phase_squad_id in (
      select s.id from fm_phase_squad s
      join fm_fantasy_team t on t.id = s.fantasy_team_id
      where t.manager_id = auth.uid()
        and s.status in ('draft', 'submitted')
    )
  )
  with check (
    phase_squad_id in (
      select s.id from fm_phase_squad s
      join fm_fantasy_team t on t.id = s.fantasy_team_id
      where t.manager_id = auth.uid()
        and s.status in ('draft', 'submitted')
    )
  );

create policy "fm_phase_squad_player: super_admin write"
  on fm_phase_squad_player for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- MATCHDAY LINEUP
-- Same pattern as phase squad but gated on round status.
-- ============================================================

create policy "fm_matchday_lineup: own read"
  on fm_matchday_lineup for select
  to authenticated
  using (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
  );

create policy "fm_matchday_lineup: revealed read"
  on fm_matchday_lineup for select
  to authenticated
  using (fm_round_is_revealed(scoring_round_id));

create policy "fm_matchday_lineup: super_admin read"
  on fm_matchday_lineup for select
  to authenticated
  using (is_super_admin());

create policy "fm_matchday_lineup: own write while draft"
  on fm_matchday_lineup for insert
  to authenticated
  with check (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status = 'draft'
  );

create policy "fm_matchday_lineup: own update while draft"
  on fm_matchday_lineup for update
  to authenticated
  using (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status in ('draft', 'submitted')
  )
  with check (
    fantasy_team_id in (
      select id from fm_fantasy_team where manager_id = auth.uid()
    )
    and status in ('draft', 'submitted')
  );

create policy "fm_matchday_lineup: super_admin write"
  on fm_matchday_lineup for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- fm_matchday_lineup_player
create policy "fm_matchday_lineup_player: own read"
  on fm_matchday_lineup_player for select
  to authenticated
  using (
    lineup_id in (
      select l.id from fm_matchday_lineup l
      join fm_fantasy_team t on t.id = l.fantasy_team_id
      where t.manager_id = auth.uid()
    )
  );

create policy "fm_matchday_lineup_player: revealed read"
  on fm_matchday_lineup_player for select
  to authenticated
  using (
    lineup_id in (
      select l.id from fm_matchday_lineup l
      where fm_round_is_revealed(l.scoring_round_id)
    )
  );

create policy "fm_matchday_lineup_player: super_admin read"
  on fm_matchday_lineup_player for select
  to authenticated
  using (is_super_admin());

create policy "fm_matchday_lineup_player: own write while draft"
  on fm_matchday_lineup_player for all
  to authenticated
  using (
    lineup_id in (
      select l.id from fm_matchday_lineup l
      join fm_fantasy_team t on t.id = l.fantasy_team_id
      where t.manager_id = auth.uid()
        and l.status in ('draft', 'submitted')
    )
  )
  with check (
    lineup_id in (
      select l.id from fm_matchday_lineup l
      join fm_fantasy_team t on t.id = l.fantasy_team_id
      where t.manager_id = auth.uid()
        and l.status in ('draft', 'submitted')
    )
  );

create policy "fm_matchday_lineup_player: super_admin write"
  on fm_matchday_lineup_player for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- ROUND OWNERSHIP — readable after round locks
-- ============================================================

create policy "fm_round_player_ownership: revealed read"
  on fm_round_player_ownership for select
  to authenticated
  using (fm_round_is_revealed(scoring_round_id) or is_super_admin());

create policy "fm_round_player_ownership: super_admin write"
  on fm_round_player_ownership for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- SCORE TABLES — readable after round publishes
-- ============================================================

create policy "fm_player_match_stats: published read"
  on fm_player_match_stats for select
  to authenticated
  using (
    real_match_id in (
      select id from fm_real_match
      where fm_round_is_published(scoring_round_id)
    )
    or is_super_admin()
  );
create policy "fm_player_match_stats: super_admin write"
  on fm_player_match_stats for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

create policy "fm_player_match_score: published read"
  on fm_player_match_score for select
  to authenticated
  using (fm_round_is_published(scoring_round_id) or is_super_admin());
create policy "fm_player_match_score: super_admin write"
  on fm_player_match_score for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

create policy "fm_coach_match_score: published read"
  on fm_coach_match_score for select
  to authenticated
  using (fm_round_is_published(scoring_round_id) or is_super_admin());
create policy "fm_coach_match_score: super_admin write"
  on fm_coach_match_score for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

create policy "fm_fantasy_team_round_score: published read"
  on fm_fantasy_team_round_score for select
  to authenticated
  using (fm_round_is_published(scoring_round_id) or is_super_admin());
create policy "fm_fantasy_team_round_score: super_admin write"
  on fm_fantasy_team_round_score for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

create policy "fm_battle_royale_matchup: published read"
  on fm_battle_royale_matchup for select
  to authenticated
  using (fm_round_is_published(scoring_round_id) or is_super_admin());
create policy "fm_battle_royale_matchup: super_admin write"
  on fm_battle_royale_matchup for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- AUDIT LOG — super_admin only
-- ============================================================

create policy "fm_audit_log: super_admin read"
  on fm_audit_log for select
  to authenticated
  using (is_super_admin());

create policy "fm_audit_log: super_admin write"
  on fm_audit_log for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());
