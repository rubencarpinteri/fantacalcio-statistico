-- Add extended_mantra_roles to formation_slots.
-- These are "out-of-position" roles: a bench player with one of these roles
-- can substitute into this slot but incurs a -1 fantavoto penalty (Mantra rules).
-- allowed_mantra_roles remains the "native / in-position" set (no penalty).

alter table formation_slots
  add column extended_mantra_roles text[] not null default '{}';
