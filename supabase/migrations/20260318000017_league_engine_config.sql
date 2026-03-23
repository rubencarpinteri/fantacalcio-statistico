-- ============================================================
-- league_engine_config: per-league configurable engine parameters
-- All bonus/malus values and fattore minuti are configurable here.
-- Default values match DEFAULT_ENGINE_CONFIG in domain/engine/v1/config.ts.
-- ============================================================

CREATE TABLE league_engine_config (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID        NOT NULL UNIQUE REFERENCES leagues(id) ON DELETE CASCADE,

  -- Fattore minuti (2-band: below threshold → partial, >= threshold → full)
  minutes_factor_threshold  INTEGER      NOT NULL DEFAULT 45,
  minutes_factor_partial    NUMERIC(5,2) NOT NULL DEFAULT 0.50,
  minutes_factor_full       NUMERIC(5,2) NOT NULL DEFAULT 1.00,

  -- Goal bonuses per role
  goal_bonus_gk   NUMERIC(5,2) NOT NULL DEFAULT  4.00,
  goal_bonus_def  NUMERIC(5,2) NOT NULL DEFAULT  2.80,
  goal_bonus_mid  NUMERIC(5,2) NOT NULL DEFAULT  2.20,
  goal_bonus_att  NUMERIC(5,2) NOT NULL DEFAULT  1.80,

  -- Penalty goal discount (penalty_goal = role_bonus - discount)
  penalty_scored_discount  NUMERIC(5,2) NOT NULL DEFAULT 0.30,

  -- Multi-goal extras
  brace_bonus      NUMERIC(5,2) NOT NULL DEFAULT  0.50,
  hat_trick_bonus  NUMERIC(5,2) NOT NULL DEFAULT  1.00,

  -- Event bonus/malus
  assist          NUMERIC(5,2) NOT NULL DEFAULT  1.00,
  own_goal        NUMERIC(5,2) NOT NULL DEFAULT -1.50,
  yellow_card     NUMERIC(5,2) NOT NULL DEFAULT -0.30,
  red_card        NUMERIC(5,2) NOT NULL DEFAULT -1.50,
  penalty_missed  NUMERIC(5,2) NOT NULL DEFAULT -1.50,
  penalty_saved   NUMERIC(5,2) NOT NULL DEFAULT  2.00,

  -- Clean sheet
  clean_sheet_gk            NUMERIC(5,2) NOT NULL DEFAULT  0.80,
  clean_sheet_def           NUMERIC(5,2) NOT NULL DEFAULT  0.50,
  clean_sheet_min_minutes   INTEGER      NOT NULL DEFAULT 60,

  -- Goals conceded
  goals_conceded_gk                NUMERIC(5,2) NOT NULL DEFAULT -0.40,
  goals_conceded_def               NUMERIC(5,2) NOT NULL DEFAULT -0.15,
  goals_conceded_def_min_minutes   INTEGER      NOT NULL DEFAULT 60,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE league_engine_config ENABLE ROW LEVEL SECURITY;

-- League admin: full CRUD
CREATE POLICY "lec_admin_all" ON league_engine_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = league_engine_config.league_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

-- League member: read-only (so Metodologia page can display values)
CREATE POLICY "lec_member_read" ON league_engine_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = league_engine_config.league_id
        AND lu.user_id = auth.uid()
    )
  );
