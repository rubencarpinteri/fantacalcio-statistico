// ============================================================
// Fantacalcio Statistico — Database Types
// Auto-generated shape: run `npm run db:types` to regenerate
// from a live Supabase project. This file is the manual
// reference version that matches the migration schema.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ---- Enums -------------------------------------------------

export type LeagueRole = 'league_admin' | 'manager'
export type RatingClass = 'GK' | 'DEF' | 'MID' | 'ATT'
export type ScoringMode = 'head_to_head' | 'points_only' | 'both'
export type DisplayRounding = 'one_decimal' | 'nearest_half'
export type LockBehavior = 'auto' | 'manual'
export type MatchdayStatus = 'draft' | 'open' | 'locked' | 'scoring' | 'published' | 'archived'
export type LineupStatus = 'draft' | 'submitted'
export type CalculationStatus = 'draft' | 'provisional' | 'published'
export type CompetitionType   = 'campionato' | 'battle_royale' | 'coppa'
export type CompetitionStatus = 'setup' | 'active' | 'completed' | 'cancelled'
export type RoundStatus       = 'pending' | 'computed' | 'locked'
export type FixtureResult     = 'home_win' | 'away_win' | 'draw'

export type AuditAction =
  | 'roster_import'
  | 'roster_edit'
  | 'player_create'
  | 'player_role_change'
  | 'player_rating_class_change'
  | 'player_transfer'
  | 'matchday_create'
  | 'matchday_status_change'
  | 'matchday_reopen'
  | 'lineup_save'
  | 'lineup_submit'
  | 'lineup_lock'
  | 'stats_edit'
  | 'ratings_edit'
  | 'calculation_draft'
  | 'calculation_publish'
  | 'override_create'
  | 'override_remove'
  | 'league_settings_change'
  | 'formation_settings_change'
  | 'ambiguous_role_change'
  | 'user_role_change'
  | 'competition_create'
  | 'competition_status_change'
  | 'competition_round_compute'
  | 'competition_calendario_generate'
  | 'rosa_assign'
  | 'rosa_release'
  | 'pool_import'

// ---- Row types ---------------------------------------------

export type Profile = {
  id: string
  username: string
  full_name: string
  is_super_admin: boolean
  created_at: string
  updated_at: string
}

export type League = {
  id: string
  name: string
  season_name: string
  timezone: string
  scoring_mode: ScoringMode
  display_rounding: DisplayRounding
  lock_behavior: LockBehavior
  advanced_bonuses_enabled: boolean
  bench_size: number
  source_weight_sofascore: number
  source_weight_fotmob: number
  created_at: string
  updated_at: string
}

export type LeagueEngineConfig = {
  id: string
  league_id: string
  minutes_factor_threshold: number
  minutes_factor_partial: number
  minutes_factor_full: number
  goal_bonus_gk: number
  goal_bonus_def: number
  goal_bonus_mid: number
  goal_bonus_att: number
  penalty_scored_discount: number
  brace_bonus: number
  hat_trick_bonus: number
  assist: number
  own_goal: number
  yellow_card: number
  red_card: number
  penalty_missed: number
  penalty_saved: number
  clean_sheet_gk: number
  clean_sheet_def: number
  clean_sheet_min_minutes: number
  goals_conceded_gk: number
  goals_conceded_def: number
  goals_conceded_def_min_minutes: number
  created_at: string
  updated_at: string
}

export type LeagueUser = {
  id: string
  league_id: string
  user_id: string
  role: LeagueRole
  joined_at: string
}

export type FantasyTeam = {
  id: string
  league_id: string
  manager_id: string
  name: string
  created_at: string
}

export type RosterImportBatch = {
  id: string
  league_id: string
  imported_by: string
  filename: string
  storage_path: string | null
  row_count: number
  success_count: number
  error_count: number
  import_summary: Json | null
  created_at: string
}

export type SerieAPlayer = {
  id: string
  full_name: string
  club: string
  mantra_roles: string[]
  rating_class: RatingClass
  sofascore_id: number | null
  fotmob_id: number | null
  season: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type LeaguePlayer = {
  id: string
  league_id: string
  full_name: string
  club: string
  mantra_roles: string[]
  primary_mantra_role: string | null
  rating_class: RatingClass
  is_active: boolean
  notes: string | null
  serie_a_player_id: string | null
  created_at: string
  updated_at: string
}

export type PlayerRoleHistory = {
  id: string
  player_id: string
  changed_at: string
  changed_by: string
  old_mantra_roles: string[] | null
  new_mantra_roles: string[] | null
  old_rating_class: RatingClass | null
  new_rating_class: RatingClass | null
  reason: string | null
}

export type RoleClassificationRule = {
  id: string
  league_id: string
  mantra_role: string
  default_rating_class: RatingClass
  updated_by: string | null
  updated_at: string
}

export type TeamRosterEntry = {
  id: string
  team_id: string
  player_id: string
  acquired_at: string
  released_at: string | null
  import_batch_id: string | null
}

export type Formation = {
  id: string
  league_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export type FormationSlot = {
  id: string
  formation_id: string
  slot_name: string
  slot_order: number
  allowed_mantra_roles: string[]
  extended_mantra_roles: string[]
  is_bench: boolean
  bench_order: number | null
}

export type MatchdayFixture = {
  id: string
  matchday_id: string
  fotmob_match_id: number | null
  sofascore_event_id: number | null
  label: string
  created_at: string
}

export type Matchday = {
  id: string
  league_id: string
  name: string
  matchday_number: number | null
  opens_at: string | null
  locks_at: string | null
  status: MatchdayStatus
  created_by: string
  created_at: string
  updated_at: string
}

export type MatchdayStatusLog = {
  id: string
  matchday_id: string
  old_status: MatchdayStatus | null
  new_status: MatchdayStatus
  changed_by: string
  changed_at: string
  note: string | null
}

export type LineupSubmission = {
  id: string
  team_id: string
  matchday_id: string
  formation_id: string
  status: LineupStatus
  submission_number: number
  created_at: string
  submitted_at: string | null
  // locked_at and locked_snapshot_json removed (migration 006):
  // lock semantics are represented by matchday.status + lineup_lock audit entries.
  actor_user_id: string
  source_ip: string | null
}

export type LineupCurrentPointer = {
  id: string
  team_id: string
  matchday_id: string
  submission_id: string
  updated_at: string
}

export type LineupSubmissionPlayer = {
  id: string
  submission_id: string
  player_id: string
  slot_id: string
  is_bench: boolean
  bench_order: number | null
  assigned_mantra_role: string | null
}

export type PlayerMatchStats = {
  id: string
  matchday_id: string
  player_id: string
  entered_by: string
  minutes_played: number
  rating_class_override: RatingClass | null

  sofascore_rating: number | null
  fotmob_rating: number | null

  tackles_won: number
  interceptions: number
  clearances: number
  blocks: number
  aerial_duels_won: number
  dribbled_past: number
  saves: number
  goals_conceded: number
  error_leading_to_goal: number

  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  clean_sheet: boolean

  key_passes: number | null
  expected_assists: number | null
  successful_dribbles: number | null
  dribble_success_rate: number | null
  completed_passes: number | null
  pass_accuracy: number | null
  final_third_passes: number | null
  progressive_passes: number | null

  is_provisional: boolean
  has_decisive_event: boolean

  created_at: string
  updated_at: string
}

export type CalculationRun = {
  id: string
  matchday_id: string
  run_number: number
  status: CalculationStatus
  engine_version: string
  /** Full engine config snapshot at run creation time — DB-level reproducibility */
  config_json: Json
  triggered_by: string
  triggered_at: string
  published_at: string | null
  published_by: string | null
  note: string | null
}

export type PlayerCalculation = {
  id: string
  run_id: string
  matchday_id: string
  player_id: string
  stats_id: string

  z_sofascore: number | null
  z_fotmob: number | null
  z_combined: number | null
  weights_used: Json | null
  minutes_factor: number | null
  z_adjusted: number | null
  b0: number | null
  role_multiplier: number | null
  b1: number | null
  defensive_correction: number | null
  voto_base: number | null
  bonus_malus_breakdown: Json | null
  total_bonus_malus: number | null
  fantavoto: number | null

  is_provisional: boolean
  is_override: boolean
  override_id: string | null

  calculated_at: string
}

export type MatchdayCurrentCalculation = {
  matchday_id: string
  run_id: string
  updated_at: string
}

export type ScoreOverride = {
  id: string
  matchday_id: string
  player_id: string
  original_fantavoto: number | null
  override_fantavoto: number
  reason: string
  created_by: string
  created_at: string
  removed_at: string | null
  removed_by: string | null
}

export type StandingsSnapshot = {
  id: string
  league_id: string
  matchday_id: string
  snapshot_json: Json
  calculated_at: string
  published_at: string | null
  version_number: number
}

export type PublishedTeamScore = {
  id: string
  league_id: string
  matchday_id: string
  team_id: string
  run_id: string
  total_fantavoto: number
  player_count: number
  nv_count: number
  published_at: string
}

export type Competition = {
  id: string
  league_id: string
  name: string
  type: CompetitionType
  status: CompetitionStatus
  season: string | null
  /** scoring_config jsonb: { method, thresholds?, points } */
  scoring_config: Json
  /** tiebreaker_config jsonb: ordered string[] of field names */
  tiebreaker_config: Json
  /** coppa_config jsonb: null for non-coppa types */
  coppa_config: Json | null
  created_by: string | null
  created_at: string
}

export type CompetitionTeam = {
  id: string
  competition_id: string
  team_id: string
  /** group_label: 'A', 'B', ... for Coppa group stage */
  group_label: string | null
  seed: number | null
}

export type CompetitionRound = {
  id: string
  competition_id: string
  round_number: number
  name: string
  matchday_id: string | null
  /** phase: 'regular' | 'group' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final' */
  phase: string
  status: RoundStatus
  computed_at: string | null
}

export type CompetitionFixture = {
  id: string
  competition_id: string
  round_id: string
  home_team_id: string
  away_team_id: string
  home_fantavoto: number | null
  away_fantavoto: number | null
  /** Fantasy goals — null when scoring method is direct_comparison */
  home_score: number | null
  away_score: number | null
  result: FixtureResult | null
  home_points: number | null
  away_points: number | null
  computed_at: string | null
}

export type CompetitionStandingsSnapshot = {
  id: string
  competition_id: string
  league_id: string
  after_round_id: string
  version_number: number
  snapshot_json: Json
  created_at: string
}

export type LiveScore = {
  matchday_id: string
  team_id: string
  league_id: string
  total_fantavoto: number
  player_count: number
  nv_count: number
  refreshed_at: string
}

export type LivePlayerScore = {
  matchday_id: string
  team_id: string
  player_id: string
  assigned_mantra_role: string | null
  is_bench: boolean
  bench_order: number | null
  sub_status: string
  extended_penalty: number
  voto_base: number | null
  fantavoto: number | null
  sofascore_rating: number | null
  fotmob_rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  yellow_cards: number
  red_cards: number
  own_goals: number
  penalties_scored: number
  saves: number
  goals_conceded: number
  refreshed_at: string
}

export type AuditLog = {
  id: string
  league_id: string | null
  actor_user_id: string | null
  action_type: AuditAction
  entity_type: string
  entity_id: string | null
  before_json: Json | null
  after_json: Json | null
  metadata_json: Json | null
  created_at: string
}

export type AppSetting = {
  id: string
  league_id: string
  key: string
  value: Json
  updated_by: string | null
  updated_at: string
}

// ---- Database shape (for typed Supabase client) ------------
// @supabase/postgrest-js v2 GenericSchema requires each table entry to satisfy
// GenericTable: { Row, Insert, Update: Record<string,unknown>, Relationships: GenericRelationship[] }
// Append-only tables originally had Update: never, which violates the constraint.
// Those are changed to Update: Record<string, unknown> here so the schema resolves correctly.
// Relationships is always empty (never[]) since we don't use PostgREST relationship joins
// for type inference — we use explicit select string parsing.

export type Database = {
  public: {
    Views: Record<never, never>
    Functions: {
      submit_lineup: {
        Args: {
          p_team_id: string
          p_matchday_id: string
          p_formation_id: string
          p_is_draft: boolean
          p_actor_user_id: string
          p_source_ip: string | null
          p_assignments: Json
        }
        Returns: Json
      }
    }
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Profile, 'id'>>
        Relationships: never[]
      }
      leagues: {
        Row: League
        Insert: Omit<League, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<League, 'id'>>
        Relationships: never[]
      }
      league_users: {
        Row: LeagueUser
        Insert: Omit<LeagueUser, 'id' | 'joined_at'> & {
          id?: string
          joined_at?: string
        }
        Update: Partial<Omit<LeagueUser, 'id'>>
        Relationships: never[]
      }
      fantasy_teams: {
        Row: FantasyTeam
        Insert: Omit<FantasyTeam, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<FantasyTeam, 'id'>>
        Relationships: never[]
      }
      roster_import_batches: {
        Row: RosterImportBatch
        Insert: Omit<RosterImportBatch, 'id' | 'created_at' | 'storage_path' | 'import_summary'> & {
          id?: string
          created_at?: string
          storage_path?: string | null
          import_summary?: Json | null
        }
        Update: Partial<Omit<RosterImportBatch, 'id'>>
        Relationships: never[]
      }
      league_players: {
        Row: LeaguePlayer
        Insert: Omit<LeaguePlayer, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'notes' | 'primary_mantra_role' | 'serie_a_player_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
          notes?: string | null
          primary_mantra_role?: string | null
          serie_a_player_id?: string | null
        }
        Update: Partial<Omit<LeaguePlayer, 'id'>>
        Relationships: never[]
      }
      serie_a_players: {
        Row: SerieAPlayer
        Insert: Omit<SerieAPlayer, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'sofascore_id' | 'fotmob_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
          sofascore_id?: number | null
          fotmob_id?: number | null
        }
        Update: Partial<Omit<SerieAPlayer, 'id'>>
        Relationships: never[]
      }
      player_role_history: {
        Row: PlayerRoleHistory
        Insert: Omit<PlayerRoleHistory, 'id' | 'changed_at'> & {
          id?: string
          changed_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      role_classification_rules: {
        Row: RoleClassificationRule
        Insert: Omit<RoleClassificationRule, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<RoleClassificationRule, 'id'>>
        Relationships: never[]
      }
      team_roster_entries: {
        Row: TeamRosterEntry
        Insert: Omit<TeamRosterEntry, 'id' | 'acquired_at' | 'released_at'> & {
          id?: string
          acquired_at?: string
          released_at?: string | null
        }
        Update: Partial<Omit<TeamRosterEntry, 'id'>>
        Relationships: never[]
      }
      formations: {
        Row: Formation
        Insert: Omit<Formation, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Formation, 'id'>>
        Relationships: never[]
      }
      formation_slots: {
        Row: FormationSlot
        Insert: Omit<FormationSlot, 'id'> & { id?: string }
        Update: Partial<Omit<FormationSlot, 'id'>>
        Relationships: never[]
      }
      matchdays: {
        Row: Matchday
        Insert: Omit<Matchday, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Matchday, 'id'>>
        Relationships: never[]
      }
      matchday_status_log: {
        Row: MatchdayStatusLog
        Insert: Omit<MatchdayStatusLog, 'id' | 'changed_at'> & {
          id?: string
          changed_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      matchday_fixtures: {
        Row: MatchdayFixture
        Insert: Omit<MatchdayFixture, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          fotmob_match_id?: number | null
          sofascore_event_id?: number | null
        }
        Update: Partial<Omit<MatchdayFixture, 'id'>>
        Relationships: never[]
      }
      lineup_submissions: {
        Row: LineupSubmission
        Insert: Omit<LineupSubmission, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      lineup_current_pointers: {
        Row: LineupCurrentPointer
        Insert: Omit<LineupCurrentPointer, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<LineupCurrentPointer, 'id'>>
        Relationships: never[]
      }
      lineup_submission_players: {
        Row: LineupSubmissionPlayer
        Insert: Omit<LineupSubmissionPlayer, 'id'> & { id?: string }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      player_match_stats: {
        Row: PlayerMatchStats
        Insert: Omit<PlayerMatchStats, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<PlayerMatchStats, 'id'>>
        Relationships: never[]
      }
      calculation_runs: {
        Row: CalculationRun
        Insert: Omit<CalculationRun, 'id' | 'triggered_at' | 'published_at' | 'published_by' | 'note'> & {
          id?: string
          triggered_at?: string
          published_at?: string | null
          published_by?: string | null
          note?: string | null
        }
        Update: Partial<Omit<CalculationRun, 'id'>>
        Relationships: never[]
      }
      player_calculations: {
        Row: PlayerCalculation
        Insert: Omit<PlayerCalculation, 'id' | 'calculated_at' | 'override_id' |
          'z_sofascore' | 'z_fotmob' | 'z_combined' | 'weights_used' |
          'minutes_factor' | 'z_adjusted' | 'b0' | 'role_multiplier' | 'b1' |
          'defensive_correction' | 'voto_base' | 'bonus_malus_breakdown' |
          'total_bonus_malus' | 'fantavoto'
        > & {
          id?: string
          calculated_at?: string
          override_id?: string | null
          z_sofascore?: number | null
          z_whoscored?: number | null
          z_fotmob?: number | null
          z_combined?: number | null
          weights_used?: PlayerCalculation['weights_used']
          minutes_factor?: number | null
          z_adjusted?: number | null
          b0?: number | null
          role_multiplier?: number | null
          b1?: number | null
          defensive_correction?: number | null
          voto_base?: number | null
          bonus_malus_breakdown?: PlayerCalculation['bonus_malus_breakdown']
          total_bonus_malus?: number | null
          fantavoto?: number | null
        }
        // append-only per run: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      matchday_current_calculation: {
        Row: MatchdayCurrentCalculation
        Insert: MatchdayCurrentCalculation
        Update: Partial<Omit<MatchdayCurrentCalculation, 'matchday_id'>>
        Relationships: never[]
      }
      score_overrides: {
        Row: ScoreOverride
        Insert: Omit<ScoreOverride, 'id' | 'created_at' | 'removed_at' | 'removed_by' | 'original_fantavoto'> & {
          id?: string
          created_at?: string
          removed_at?: string | null
          removed_by?: string | null
          original_fantavoto?: number | null
        }
        Update: Partial<Omit<ScoreOverride, 'id'>>
        Relationships: never[]
      }
      standings_snapshots: {
        Row: StandingsSnapshot
        Insert: Omit<StandingsSnapshot, 'id' | 'calculated_at'> & {
          id?: string
          calculated_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      published_team_scores: {
        Row: PublishedTeamScore
        Insert: Omit<PublishedTeamScore, 'id'> & { id?: string }
        Update: Partial<Omit<PublishedTeamScore, 'id'>>
        Relationships: never[]
      }
      competitions: {
        Row: Competition
        Insert: Omit<Competition, 'id' | 'created_at' | 'status' | 'tiebreaker_config' | 'coppa_config'> & {
          id?: string
          created_at?: string
          status?: CompetitionStatus
          tiebreaker_config?: Json
          coppa_config?: Json | null
        }
        Update: Partial<Omit<Competition, 'id'>>
        Relationships: never[]
      }
      competition_teams: {
        Row: CompetitionTeam
        Insert: Omit<CompetitionTeam, 'id' | 'group_label' | 'seed'> & {
          id?: string
          group_label?: string | null
          seed?: number | null
        }
        Update: Partial<Omit<CompetitionTeam, 'id'>>
        Relationships: never[]
      }
      competition_rounds: {
        Row: CompetitionRound
        Insert: Omit<CompetitionRound, 'id' | 'matchday_id' | 'computed_at'> & {
          id?: string
          matchday_id?: string | null
          computed_at?: string | null
        }
        Update: Partial<Omit<CompetitionRound, 'id'>>
        Relationships: never[]
      }
      competition_fixtures: {
        Row: CompetitionFixture
        Insert: Omit<
          CompetitionFixture,
          'id' | 'home_fantavoto' | 'away_fantavoto' | 'home_score' | 'away_score' |
          'result' | 'home_points' | 'away_points' | 'computed_at'
        > & {
          id?: string
          home_fantavoto?: number | null
          away_fantavoto?: number | null
          home_score?: number | null
          away_score?: number | null
          result?: FixtureResult | null
          home_points?: number | null
          away_points?: number | null
          computed_at?: string | null
        }
        Update: Partial<Omit<CompetitionFixture, 'id'>>
        Relationships: never[]
      }
      competition_standings_snapshots: {
        Row: CompetitionStandingsSnapshot
        Insert: Omit<CompetitionStandingsSnapshot, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        // append-only: no update operations permitted
        Update: Record<string, unknown>
        Relationships: never[]
      }
      app_settings: {
        Row: AppSetting
        Insert: Omit<AppSetting, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<AppSetting, 'id'>>
        Relationships: never[]
      }
      league_engine_config: {
        Row: LeagueEngineConfig
        Insert: Omit<LeagueEngineConfig, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<LeagueEngineConfig, 'id' | 'league_id'>>
        Relationships: never[]
      }
      live_scores: {
        Row: LiveScore
        Insert: Omit<LiveScore, 'refreshed_at'> & { refreshed_at?: string }
        Update: Partial<LiveScore>
        Relationships: never[]
      }
      live_player_scores: {
        Row: LivePlayerScore
        Insert: Omit<LivePlayerScore, 'refreshed_at'> & { refreshed_at?: string }
        Update: Partial<LivePlayerScore>
        Relationships: never[]
      }
    }
    Enums: {
      league_role: LeagueRole
      rating_class: RatingClass
      scoring_mode: ScoringMode
      display_rounding: DisplayRounding
      lock_behavior: LockBehavior
      matchday_status: MatchdayStatus
      lineup_status: LineupStatus
      calculation_status: CalculationStatus
      audit_action: AuditAction
      competition_type: CompetitionType
      competition_status: CompetitionStatus
      round_status: RoundStatus
      fixture_result: FixtureResult
    }
  }
}
