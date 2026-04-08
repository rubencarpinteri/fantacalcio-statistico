export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          league_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          league_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          league_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          league_id: string | null
          metadata_json: Json | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          league_id?: string | null
          metadata_json?: Json | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          league_id?: string | null
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_runs: {
        Row: {
          config_json: Json
          engine_version: string
          id: string
          matchday_id: string
          note: string | null
          published_at: string | null
          published_by: string | null
          run_number: number
          status: Database["public"]["Enums"]["calculation_status"]
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          config_json?: Json
          engine_version?: string
          id?: string
          matchday_id: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          run_number: number
          status?: Database["public"]["Enums"]["calculation_status"]
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          config_json?: Json
          engine_version?: string
          id?: string
          matchday_id?: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          run_number?: number
          status?: Database["public"]["Enums"]["calculation_status"]
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_runs_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_runs_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_fixtures: {
        Row: {
          away_fantavoto: number | null
          away_points: number | null
          away_score: number | null
          away_team_id: string
          competition_id: string
          computed_at: string | null
          home_fantavoto: number | null
          home_points: number | null
          home_score: number | null
          home_team_id: string
          id: string
          result: Database["public"]["Enums"]["fixture_result"] | null
          round_id: string
        }
        Insert: {
          away_fantavoto?: number | null
          away_points?: number | null
          away_score?: number | null
          away_team_id: string
          competition_id: string
          computed_at?: string | null
          home_fantavoto?: number | null
          home_points?: number | null
          home_score?: number | null
          home_team_id: string
          id?: string
          result?: Database["public"]["Enums"]["fixture_result"] | null
          round_id: string
        }
        Update: {
          away_fantavoto?: number | null
          away_points?: number | null
          away_score?: number | null
          away_team_id?: string
          competition_id?: string
          computed_at?: string | null
          home_fantavoto?: number | null
          home_points?: number | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          result?: Database["public"]["Enums"]["fixture_result"] | null
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "competition_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_matchups: {
        Row: {
          away_fantavoto: number | null
          away_team_id: string
          competition_id: string
          computed_at: string | null
          created_at: string
          home_fantavoto: number | null
          home_team_id: string
          id: string
          result: string | null
          round_number: number
        }
        Insert: {
          away_fantavoto?: number | null
          away_team_id: string
          competition_id: string
          computed_at?: string | null
          created_at?: string
          home_fantavoto?: number | null
          home_team_id: string
          id?: string
          result?: string | null
          round_number: number
        }
        Update: {
          away_fantavoto?: number | null
          away_team_id?: string
          competition_id?: string
          computed_at?: string | null
          created_at?: string
          home_fantavoto?: number | null
          home_team_id?: string
          id?: string
          result?: string | null
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_matchups_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_matchups_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_matchups_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_rounds: {
        Row: {
          competition_id: string
          computed_at: string | null
          id: string
          matchday_id: string | null
          name: string
          phase: string
          round_number: number
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          competition_id: string
          computed_at?: string | null
          id?: string
          matchday_id?: string | null
          name: string
          phase?: string
          round_number: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          competition_id?: string
          computed_at?: string | null
          id?: string
          matchday_id?: string | null
          name?: string
          phase?: string
          round_number?: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "competition_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_rounds_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_standings_snapshots: {
        Row: {
          after_round_id: string
          competition_id: string
          created_at: string
          id: string
          league_id: string
          snapshot_json: Json
          version_number: number
        }
        Insert: {
          after_round_id: string
          competition_id: string
          created_at?: string
          id?: string
          league_id: string
          snapshot_json: Json
          version_number: number
        }
        Update: {
          after_round_id?: string
          competition_id?: string
          created_at?: string
          id?: string
          league_id?: string
          snapshot_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_standings_snapshots_after_round_id_fkey"
            columns: ["after_round_id"]
            isOneToOne: false
            referencedRelation: "competition_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_standings_snapshots_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_standings_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_teams: {
        Row: {
          competition_id: string
          group_label: string | null
          id: string
          seed: number | null
          team_id: string
        }
        Insert: {
          competition_id: string
          group_label?: string | null
          id?: string
          seed?: number | null
          team_id: string
        }
        Update: {
          competition_id?: string
          group_label?: string | null
          id?: string
          seed?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          coppa_config: Json | null
          created_at: string
          created_by: string | null
          id: string
          league_id: string
          name: string
          scoring_config: Json
          season: string | null
          status: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config: Json
          type: Database["public"]["Enums"]["competition_type"]
        }
        Insert: {
          coppa_config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          league_id: string
          name: string
          scoring_config?: Json
          season?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config?: Json
          type: Database["public"]["Enums"]["competition_type"]
        }
        Update: {
          coppa_config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          league_id?: string
          name?: string
          scoring_config?: Json
          season?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config?: Json
          type?: Database["public"]["Enums"]["competition_type"]
        }
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          created_at: string
          id: string
          league_id: string
          leghe_names: string[]
          manager_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          leghe_names?: string[]
          manager_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          leghe_names?: string[]
          manager_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      formation_slots: {
        Row: {
          allowed_mantra_roles: string[]
          bench_order: number | null
          extended_mantra_roles: string[]
          formation_id: string
          id: string
          is_bench: boolean
          slot_name: string
          slot_order: number
        }
        Insert: {
          allowed_mantra_roles: string[]
          bench_order?: number | null
          extended_mantra_roles?: string[]
          formation_id: string
          id?: string
          is_bench?: boolean
          slot_name: string
          slot_order: number
        }
        Update: {
          allowed_mantra_roles?: string[]
          bench_order?: number | null
          extended_mantra_roles?: string[]
          formation_id?: string
          id?: string
          is_bench?: boolean
          slot_name?: string
          slot_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "formation_slots_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
        ]
      }
      fotmob_ignored_players: {
        Row: {
          created_at: string
          fotmob_name: string
          fotmob_player_id: number
          league_id: string
        }
        Insert: {
          created_at?: string
          fotmob_name: string
          fotmob_player_id: number
          league_id: string
        }
        Update: {
          created_at?: string
          fotmob_name?: string
          fotmob_player_id?: number
          league_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotmob_ignored_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      formations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          league_id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          league_id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          league_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "formations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fotmob_unmatched_players: {
        Row: {
          created_at: string
          fotmob_name: string
          fotmob_player_id: number
          fotmob_team: string | null
          matchday_id: string
        }
        Insert: {
          created_at?: string
          fotmob_name: string
          fotmob_player_id: number
          fotmob_team?: string | null
          matchday_id: string
        }
        Update: {
          created_at?: string
          fotmob_name?: string
          fotmob_player_id?: number
          fotmob_team?: string | null
          matchday_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotmob_unmatched_players_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      league_engine_config: {
        Row: {
          assist: number
          brace_bonus: number
          clean_sheet_def: number
          clean_sheet_gk: number
          clean_sheet_min_minutes: number
          created_at: string
          goal_bonus_att: number
          goal_bonus_def: number
          goal_bonus_gk: number
          goal_bonus_mid: number
          goals_conceded_def: number
          goals_conceded_def_min_minutes: number
          fotmob_mean: number
          fotmob_std: number
          fotmob_weight: number
          goals_conceded_gk: number
          hat_trick_bonus: number
          id: string
          league_id: string
          minutes_factor_full: number
          minutes_factor_partial: number
          minutes_factor_threshold: number
          own_goal: number
          penalty_missed: number
          penalty_saved: number
          penalty_scored_discount: number
          red_card: number
          role_multiplier_att: number
          role_multiplier_def: number
          role_multiplier_gk: number
          role_multiplier_mid: number
          sofascore_mean: number
          sofascore_std: number
          updated_at: string
          yellow_card: number
        }
        Insert: {
          assist?: number
          brace_bonus?: number
          clean_sheet_def?: number
          clean_sheet_gk?: number
          clean_sheet_min_minutes?: number
          created_at?: string
          goal_bonus_att?: number
          goal_bonus_def?: number
          goal_bonus_gk?: number
          goal_bonus_mid?: number
          goals_conceded_def?: number
          goals_conceded_def_min_minutes?: number
          fotmob_mean?: number | null
          fotmob_std?: number | null
          fotmob_weight?: number | null
          goals_conceded_gk?: number
          hat_trick_bonus?: number
          id?: string
          league_id: string
          minutes_factor_full?: number
          minutes_factor_partial?: number
          minutes_factor_threshold?: number
          own_goal?: number
          penalty_missed?: number
          penalty_saved?: number
          penalty_scored_discount?: number
          red_card?: number
          role_multiplier_att?: number
          role_multiplier_def?: number
          role_multiplier_gk?: number
          role_multiplier_mid?: number
          sofascore_mean?: number | null
          sofascore_std?: number | null
          updated_at?: string
          yellow_card?: number
        }
        Update: {
          assist?: number
          brace_bonus?: number
          clean_sheet_def?: number
          clean_sheet_gk?: number
          clean_sheet_min_minutes?: number
          created_at?: string
          goal_bonus_att?: number
          goal_bonus_def?: number
          goal_bonus_gk?: number
          goal_bonus_mid?: number
          goals_conceded_def?: number
          goals_conceded_def_min_minutes?: number
          fotmob_mean?: number | null
          fotmob_std?: number | null
          fotmob_weight?: number | null
          goals_conceded_gk?: number
          hat_trick_bonus?: number
          id?: string
          league_id?: string
          minutes_factor_full?: number
          minutes_factor_partial?: number
          minutes_factor_threshold?: number
          own_goal?: number
          penalty_missed?: number
          penalty_saved?: number
          penalty_scored_discount?: number
          red_card?: number
          role_multiplier_att?: number
          role_multiplier_def?: number
          role_multiplier_gk?: number
          role_multiplier_mid?: number
          sofascore_mean?: number | null
          sofascore_std?: number | null
          updated_at?: string
          yellow_card?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_engine_config_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_players: {
        Row: {
          club: string
          created_at: string
          fotmob_player_id: number | null
          full_name: string
          id: string
          is_active: boolean
          league_id: string
          mantra_roles: string[]
          notes: string | null
          primary_mantra_role: string | null
          rating_class: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id: string | null
          updated_at: string
        }
        Insert: {
          club: string
          created_at?: string
          fotmob_player_id?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          league_id: string
          mantra_roles: string[]
          notes?: string | null
          primary_mantra_role?: string | null
          rating_class: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id?: string | null
          updated_at?: string
        }
        Update: {
          club?: string
          created_at?: string
          fotmob_player_id?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          league_id?: string
          mantra_roles?: string[]
          notes?: string | null
          primary_mantra_role?: string | null
          rating_class?: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_serie_a_player_id_fkey"
            columns: ["serie_a_player_id"]
            isOneToOne: false
            referencedRelation: "serie_a_players"
            referencedColumns: ["id"]
          },
        ]
      }
      league_users: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          role?: Database["public"]["Enums"]["league_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_users_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          advanced_bonuses_enabled: boolean
          bench_size: number
          created_at: string
          display_rounding: Database["public"]["Enums"]["display_rounding"]
          id: string
          lock_behavior: Database["public"]["Enums"]["lock_behavior"]
          name: string
          scoring_mode: Database["public"]["Enums"]["scoring_mode"]
          season_name: string
          source_weight_fotmob: number
          source_weight_sofascore: number
          timezone: string
          updated_at: string
        }
        Insert: {
          advanced_bonuses_enabled?: boolean
          bench_size?: number
          created_at?: string
          display_rounding?: Database["public"]["Enums"]["display_rounding"]
          id?: string
          lock_behavior?: Database["public"]["Enums"]["lock_behavior"]
          name: string
          scoring_mode?: Database["public"]["Enums"]["scoring_mode"]
          season_name: string
          source_weight_fotmob?: number
          source_weight_sofascore?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          advanced_bonuses_enabled?: boolean
          bench_size?: number
          created_at?: string
          display_rounding?: Database["public"]["Enums"]["display_rounding"]
          id?: string
          lock_behavior?: Database["public"]["Enums"]["lock_behavior"]
          name?: string
          scoring_mode?: Database["public"]["Enums"]["scoring_mode"]
          season_name?: string
          source_weight_fotmob?: number
          source_weight_sofascore?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      lineup_current_pointers: {
        Row: {
          id: string
          matchday_id: string
          submission_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          matchday_id: string
          submission_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          matchday_id?: string
          submission_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_current_pointers_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_current_pointers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "lineup_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_current_pointers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_submission_players: {
        Row: {
          assigned_mantra_role: string | null
          bench_order: number | null
          id: string
          is_bench: boolean
          player_id: string
          slot_id: string
          submission_id: string
        }
        Insert: {
          assigned_mantra_role?: string | null
          bench_order?: number | null
          id?: string
          is_bench?: boolean
          player_id: string
          slot_id: string
          submission_id: string
        }
        Update: {
          assigned_mantra_role?: string | null
          bench_order?: number | null
          id?: string
          is_bench?: boolean
          player_id?: string
          slot_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_submission_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submission_players_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "formation_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submission_players_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "lineup_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_submissions: {
        Row: {
          actor_user_id: string
          created_at: string
          formation_id: string
          id: string
          matchday_id: string
          source_ip: string | null
          status: Database["public"]["Enums"]["lineup_status"]
          submission_number: number
          submitted_at: string | null
          team_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          formation_id: string
          id?: string
          matchday_id: string
          source_ip?: string | null
          status?: Database["public"]["Enums"]["lineup_status"]
          submission_number?: number
          submitted_at?: string | null
          team_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          formation_id?: string
          id?: string
          matchday_id?: string
          source_ip?: string | null
          status?: Database["public"]["Enums"]["lineup_status"]
          submission_number?: number
          submitted_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_submissions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_player_scores: {
        Row: {
          assigned_mantra_role: string | null
          assists: number
          bench_order: number | null
          extended_penalty: number
          fantavoto: number | null
          fotmob_rating: number | null
          goals_conceded: number
          goals_scored: number
          is_bench: boolean
          matchday_id: string
          minutes_played: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          penalties_scored: number
          player_id: string
          red_cards: number
          refreshed_at: string
          saves: number
          sofascore_rating: number | null
          sub_status: string
          team_id: string
          voto_base: number | null
          yellow_cards: number
        }
        Insert: {
          assigned_mantra_role?: string | null
          assists?: number
          bench_order?: number | null
          extended_penalty?: number
          fantavoto?: number | null
          fotmob_rating?: number | null
          goals_conceded?: number
          goals_scored?: number
          is_bench?: boolean
          matchday_id: string
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id: string
          red_cards?: number
          refreshed_at?: string
          saves?: number
          sofascore_rating?: number | null
          sub_status?: string
          team_id: string
          voto_base?: number | null
          yellow_cards?: number
        }
        Update: {
          assigned_mantra_role?: string | null
          assists?: number
          bench_order?: number | null
          extended_penalty?: number
          fantavoto?: number | null
          fotmob_rating?: number | null
          goals_conceded?: number
          goals_scored?: number
          is_bench?: boolean
          matchday_id?: string
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id?: string
          red_cards?: number
          refreshed_at?: string
          saves?: number
          sofascore_rating?: number | null
          sub_status?: string
          team_id?: string
          voto_base?: number | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_player_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_player_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_player_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_scores: {
        Row: {
          league_id: string
          matchday_id: string
          nv_count: number
          player_count: number
          refreshed_at: string
          team_id: string
          total_fantavoto: number
        }
        Insert: {
          league_id: string
          matchday_id: string
          nv_count?: number
          player_count?: number
          refreshed_at?: string
          team_id: string
          total_fantavoto?: number
        }
        Update: {
          league_id?: string
          matchday_id?: string
          nv_count?: number
          player_count?: number
          refreshed_at?: string
          team_id?: string
          total_fantavoto?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_current_calculation: {
        Row: {
          matchday_id: string
          run_id: string
          updated_at: string
        }
        Insert: {
          matchday_id: string
          run_id: string
          updated_at?: string
        }
        Update: {
          matchday_id?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_current_calculation_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: true
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_current_calculation_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_fixtures: {
        Row: {
          created_at: string
          fotmob_match_id: number | null
          id: string
          label: string
          matchday_id: string
          sofascore_event_id: number | null
        }
        Insert: {
          created_at?: string
          fotmob_match_id?: number | null
          id?: string
          label?: string
          matchday_id: string
          sofascore_event_id?: number | null
        }
        Update: {
          created_at?: string
          fotmob_match_id?: number | null
          id?: string
          label?: string
          matchday_id?: string
          sofascore_event_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matchday_fixtures_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_lineups: {
        Row: {
          bench: Json
          created_at: string
          id: string
          league_id: string
          matchday_id: string
          run_id: string
          starters: Json
          team_id: string
        }
        Insert: {
          bench?: Json
          created_at?: string
          id?: string
          league_id: string
          matchday_id: string
          run_id: string
          starters?: Json
          team_id: string
        }
        Update: {
          bench?: Json
          created_at?: string
          id?: string
          league_id?: string
          matchday_id?: string
          run_id?: string
          starters?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_lineups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_status_log: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          matchday_id: string
          new_status: Database["public"]["Enums"]["matchday_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["matchday_status"] | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          matchday_id: string
          new_status: Database["public"]["Enums"]["matchday_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["matchday_status"] | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          matchday_id?: string
          new_status?: Database["public"]["Enums"]["matchday_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["matchday_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "matchday_status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_status_log_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      matchdays: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_frozen: boolean
          league_id: string
          locks_at: string | null
          matchday_number: number | null
          name: string
          opens_at: string | null
          round_number: number | null
          status: Database["public"]["Enums"]["matchday_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_frozen?: boolean
          league_id: string
          locks_at?: string | null
          matchday_number?: number | null
          name: string
          opens_at?: string | null
          round_number?: number | null
          status?: Database["public"]["Enums"]["matchday_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_frozen?: boolean
          league_id?: string
          locks_at?: string | null
          matchday_number?: number | null
          name?: string
          opens_at?: string | null
          round_number?: number | null
          status?: Database["public"]["Enums"]["matchday_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchdays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchdays_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_calculations: {
        Row: {
          b0: number | null
          b1: number | null
          bonus_malus_breakdown: Json | null
          calculated_at: string
          defensive_correction: number | null
          fantavoto: number | null
          id: string
          is_override: boolean
          is_provisional: boolean
          matchday_id: string
          minutes_factor: number | null
          override_id: string | null
          player_id: string
          role_multiplier: number | null
          run_id: string
          stats_id: string
          total_bonus_malus: number | null
          voto_base: number | null
          weights_used: Json | null
          z_adjusted: number | null
          z_combined: number | null
          z_fotmob: number | null
          z_sofascore: number | null
        }
        Insert: {
          b0?: number | null
          b1?: number | null
          bonus_malus_breakdown?: Json | null
          calculated_at?: string
          defensive_correction?: number | null
          fantavoto?: number | null
          id?: string
          is_override?: boolean
          is_provisional?: boolean
          matchday_id: string
          minutes_factor?: number | null
          override_id?: string | null
          player_id: string
          role_multiplier?: number | null
          run_id: string
          stats_id: string
          total_bonus_malus?: number | null
          voto_base?: number | null
          weights_used?: Json | null
          z_adjusted?: number | null
          z_combined?: number | null
          z_fotmob?: number | null
          z_sofascore?: number | null
        }
        Update: {
          b0?: number | null
          b1?: number | null
          bonus_malus_breakdown?: Json | null
          calculated_at?: string
          defensive_correction?: number | null
          fantavoto?: number | null
          id?: string
          is_override?: boolean
          is_provisional?: boolean
          matchday_id?: string
          minutes_factor?: number | null
          override_id?: string | null
          player_id?: string
          role_multiplier?: number | null
          run_id?: string
          stats_id?: string
          total_bonus_malus?: number | null
          voto_base?: number | null
          weights_used?: Json | null
          z_adjusted?: number | null
          z_combined?: number | null
          z_fotmob?: number | null
          z_sofascore?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_calculations_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "score_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_stats_id_fkey"
            columns: ["stats_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          aerial_duels_won: number
          assists: number
          blocks: number
          clean_sheet: boolean
          clearances: number
          completed_passes: number | null
          created_at: string
          dribble_success_rate: number | null
          dribbled_past: number
          entered_by: string
          error_leading_to_goal: number
          expected_assists: number | null
          final_third_passes: number | null
          fotmob_rating: number | null
          goals_conceded: number
          goals_scored: number
          has_decisive_event: boolean
          id: string
          interceptions: number
          is_provisional: boolean
          key_passes: number | null
          matchday_id: string
          minutes_played: number
          own_goals: number
          pass_accuracy: number | null
          penalties_missed: number
          penalties_saved: number
          penalties_scored: number
          player_id: string
          progressive_passes: number | null
          rating_class_override:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards: number
          saves: number
          sofascore_rating: number | null
          successful_dribbles: number | null
          tackles_won: number
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          aerial_duels_won?: number
          assists?: number
          blocks?: number
          clean_sheet?: boolean
          clearances?: number
          completed_passes?: number | null
          created_at?: string
          dribble_success_rate?: number | null
          dribbled_past?: number
          entered_by: string
          error_leading_to_goal?: number
          expected_assists?: number | null
          final_third_passes?: number | null
          fotmob_rating?: number | null
          goals_conceded?: number
          goals_scored?: number
          has_decisive_event?: boolean
          id?: string
          interceptions?: number
          is_provisional?: boolean
          key_passes?: number | null
          matchday_id: string
          minutes_played?: number
          own_goals?: number
          pass_accuracy?: number | null
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id: string
          progressive_passes?: number | null
          rating_class_override?:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards?: number
          saves?: number
          sofascore_rating?: number | null
          successful_dribbles?: number | null
          tackles_won?: number
          updated_at?: string
          yellow_cards?: number
        }
        Update: {
          aerial_duels_won?: number
          assists?: number
          blocks?: number
          clean_sheet?: boolean
          clearances?: number
          completed_passes?: number | null
          created_at?: string
          dribble_success_rate?: number | null
          dribbled_past?: number
          entered_by?: string
          error_leading_to_goal?: number
          expected_assists?: number | null
          final_third_passes?: number | null
          fotmob_rating?: number | null
          goals_conceded?: number
          goals_scored?: number
          has_decisive_event?: boolean
          id?: string
          interceptions?: number
          is_provisional?: boolean
          key_passes?: number | null
          matchday_id?: string
          minutes_played?: number
          own_goals?: number
          pass_accuracy?: number | null
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id?: string
          progressive_passes?: number | null
          rating_class_override?:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards?: number
          saves?: number
          sofascore_rating?: number | null
          successful_dribbles?: number | null
          tackles_won?: number
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_role_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_mantra_roles: string[] | null
          new_rating_class: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles: string[] | null
          old_rating_class: Database["public"]["Enums"]["rating_class"] | null
          player_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_mantra_roles?: string[] | null
          new_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles?: string[] | null
          old_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          player_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_mantra_roles?: string[] | null
          new_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles?: string[] | null
          old_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          player_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_role_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_role_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_super_admin: boolean
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_super_admin?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_super_admin?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      published_team_scores: {
        Row: {
          id: string
          league_id: string
          matchday_id: string
          nv_count: number
          player_count: number
          published_at: string
          run_id: string
          team_id: string
          total_fantavoto: number
        }
        Insert: {
          id?: string
          league_id: string
          matchday_id: string
          nv_count?: number
          player_count?: number
          published_at?: string
          run_id: string
          team_id: string
          total_fantavoto: number
        }
        Update: {
          id?: string
          league_id?: string
          matchday_id?: string
          nv_count?: number
          player_count?: number
          published_at?: string
          run_id?: string
          team_id?: string
          total_fantavoto?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_team_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      role_classification_rules: {
        Row: {
          default_rating_class: Database["public"]["Enums"]["rating_class"]
          id: string
          league_id: string
          mantra_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_rating_class: Database["public"]["Enums"]["rating_class"]
          id?: string
          league_id: string
          mantra_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_rating_class?: Database["public"]["Enums"]["rating_class"]
          id?: string
          league_id?: string
          mantra_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_classification_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_classification_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_import_batches: {
        Row: {
          created_at: string
          error_count: number
          filename: string
          id: string
          import_summary: Json | null
          imported_by: string
          league_id: string
          row_count: number
          storage_path: string | null
          success_count: number
        }
        Insert: {
          created_at?: string
          error_count?: number
          filename: string
          id?: string
          import_summary?: Json | null
          imported_by: string
          league_id: string
          row_count?: number
          storage_path?: string | null
          success_count?: number
        }
        Update: {
          created_at?: string
          error_count?: number
          filename?: string
          id?: string
          import_summary?: Json | null
          imported_by?: string
          league_id?: string
          row_count?: number
          storage_path?: string | null
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_import_batches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      score_overrides: {
        Row: {
          created_at: string
          created_by: string
          id: string
          matchday_id: string
          original_fantavoto: number | null
          override_fantavoto: number
          player_id: string
          reason: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          matchday_id: string
          original_fantavoto?: number | null
          override_fantavoto: number
          player_id: string
          reason: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          matchday_id?: string
          original_fantavoto?: number | null
          override_fantavoto?: number
          player_id?: string
          reason?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      serie_a_players: {
        Row: {
          club: string
          created_at: string
          fotmob_id: number | null
          full_name: string
          id: string
          is_active: boolean
          mantra_roles: string[]
          rating_class: string
          search_name: string | null
          season: string
          sofascore_id: number | null
          updated_at: string
        }
        Insert: {
          club: string
          created_at?: string
          fotmob_id?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          mantra_roles?: string[]
          rating_class: string
          search_name?: string | null
          season?: string
          sofascore_id?: number | null
          updated_at?: string
        }
        Update: {
          club?: string
          created_at?: string
          fotmob_id?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          mantra_roles?: string[]
          rating_class?: string
          search_name?: string | null
          season?: string
          sofascore_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      standings_snapshots: {
        Row: {
          calculated_at: string
          id: string
          league_id: string
          matchday_id: string
          published_at: string | null
          snapshot_json: Json
          version_number: number
        }
        Insert: {
          calculated_at?: string
          id?: string
          league_id: string
          matchday_id: string
          published_at?: string | null
          snapshot_json: Json
          version_number?: number
        }
        Update: {
          calculated_at?: string
          id?: string
          league_id?: string
          matchday_id?: string
          published_at?: string | null
          snapshot_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_snapshots_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roster_entries: {
        Row: {
          acquired_at: string
          id: string
          import_batch_id: string | null
          player_id: string
          released_at: string | null
          team_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          import_batch_id?: string | null
          player_id: string
          released_at?: string | null
          team_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          import_batch_id?: string | null
          player_id?: string
          released_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_roster_entries_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "roster_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_roster_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_roster_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_team_id: { Args: { p_league_id: string }; Returns: string }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_league_admin: { Args: { p_league_id: string }; Returns: boolean }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_lineup: {
        Args: {
          p_actor_user_id: string
          p_assignments: Json
          p_formation_id: string
          p_is_draft: boolean
          p_matchday_id: string
          p_source_ip: string
          p_team_id: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      audit_action:
        | "roster_import"
        | "roster_edit"
        | "player_create"
        | "player_role_change"
        | "player_rating_class_change"
        | "player_transfer"
        | "matchday_create"
        | "matchday_status_change"
        | "matchday_reopen"
        | "lineup_save"
        | "lineup_submit"
        | "lineup_lock"
        | "stats_edit"
        | "ratings_edit"
        | "calculation_draft"
        | "calculation_publish"
        | "override_create"
        | "override_remove"
        | "league_settings_change"
        | "formation_settings_change"
        | "ambiguous_role_change"
        | "user_role_change"
        | "rosa_assign"
        | "rosa_release"
        | "pool_import"
        | "competition_create"
        | "competition_status_change"
        | "competition_round_compute"
        | "competition_calendario_generate"
      calculation_status: "draft" | "provisional" | "published"
      competition_status: "setup" | "active" | "completed" | "cancelled"
      competition_type: "campionato" | "battle_royale" | "coppa"
      display_rounding: "one_decimal" | "nearest_half"
      fixture_result: "home_win" | "away_win" | "draw"
      league_role: "league_admin" | "manager"
      lineup_status: "draft" | "submitted"
      lock_behavior: "auto" | "manual"
      matchday_status:
        | "draft"
        | "open"
        | "closed"
        | "locked"
        | "scoring"
        | "published"
        | "archived"
      rating_class: "GK" | "DEF" | "MID" | "ATT"
      round_status: "pending" | "computed" | "locked"
      scoring_mode: "head_to_head" | "points_only" | "both"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "roster_import",
        "roster_edit",
        "player_create",
        "player_role_change",
        "player_rating_class_change",
        "player_transfer",
        "matchday_create",
        "matchday_status_change",
        "matchday_reopen",
        "lineup_save",
        "lineup_submit",
        "lineup_lock",
        "stats_edit",
        "ratings_edit",
        "calculation_draft",
        "calculation_publish",
        "override_create",
        "override_remove",
        "league_settings_change",
        "formation_settings_change",
        "ambiguous_role_change",
        "user_role_change",
        "rosa_assign",
        "rosa_release",
        "pool_import",
        "competition_create",
        "competition_status_change",
        "competition_round_compute",
        "competition_calendario_generate",
      ],
      calculation_status: ["draft", "provisional", "published"],
      competition_status: ["setup", "active", "completed", "cancelled"],
      competition_type: ["campionato", "battle_royale", "coppa"],
      display_rounding: ["one_decimal", "nearest_half"],
      fixture_result: ["home_win", "away_win", "draw"],
      league_role: ["league_admin", "manager"],
      lineup_status: ["draft", "submitted"],
      lock_behavior: ["auto", "manual"],
      matchday_status: [
        "draft",
        "open",
        "closed",
        "locked",
        "scoring",
        "published",
        "archived",
      ],
      rating_class: ["GK", "DEF", "MID", "ATT"],
      round_status: ["pending", "computed", "locked"],
      scoring_mode: ["head_to_head", "points_only", "both"],
    },
  },
} as const

// ── Named type aliases (hand-maintained; regenerate the block above, keep these) ──

export type AuditAction = Database["public"]["Enums"]["audit_action"]
export type RatingClass = Database["public"]["Enums"]["rating_class"]
export type MatchdayStatus = Database["public"]["Enums"]["matchday_status"]
export type LeagueRole = Database["public"]["Enums"]["league_role"]
export type CompetitionType = Database["public"]["Enums"]["competition_type"]

export type League = Database["public"]["Tables"]["leagues"]["Row"]
export type LeaguePlayer = Database["public"]["Tables"]["league_players"]["Row"]
export type Matchday = Database["public"]["Tables"]["matchdays"]["Row"]
export type MatchdayFixture = Database["public"]["Tables"]["matchday_fixtures"]["Row"]
export type Formation = Database["public"]["Tables"]["formations"]["Row"]
export type FormationSlot = Database["public"]["Tables"]["formation_slots"]["Row"]
export type FantasyTeam = Database["public"]["Tables"]["fantasy_teams"]["Row"]
export type Competition = Database["public"]["Tables"]["competitions"]["Row"]
export type CompetitionRound = Database["public"]["Tables"]["competition_rounds"]["Row"]
export type CompetitionFixture = Database["public"]["Tables"]["competition_fixtures"]["Row"]
export type CompetitionMatchup = Database["public"]["Tables"]["competition_matchups"]["Row"]
export type LeagueEngineConfig = Database["public"]["Tables"]["league_engine_config"]["Row"]
export type SerieAPlayer = Database["public"]["Tables"]["serie_a_players"]["Row"]
