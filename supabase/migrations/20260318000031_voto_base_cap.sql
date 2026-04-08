-- Add configurable voto_base cap min/max to league_engine_config
-- Default: min 3.0, max 10.0 (raised from previous hardcoded 9.5)

ALTER TABLE league_engine_config
  ADD COLUMN IF NOT EXISTS voto_base_cap_min numeric(4,2) NULL,
  ADD COLUMN IF NOT EXISTS voto_base_cap_max numeric(4,2) NULL;

COMMENT ON COLUMN league_engine_config.voto_base_cap_min IS
  'Minimum voto_base after clamp (default 3.0)';
COMMENT ON COLUMN league_engine_config.voto_base_cap_max IS
  'Maximum voto_base after clamp (default 10.0)';
