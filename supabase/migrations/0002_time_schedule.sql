-- ---------------------------------------------------------------------------
-- Cookwise — per-meal cooking time
--
-- Adds `profiles.time_schedule`, the optional weekly grid behind
-- `UserProfile.timeSchedule` in src/lib/types.ts, for example
--   {"mon": {"breakfast": "little", "lunch": "plenty", "dinner": "plenty"}, ...}
-- Valid levels: very_little (~10 min), little (~20), some (~30), plenty.
-- Null means "use time_availability for every meal".
--
-- Idempotent: safe to re-apply. PlannedMeal.leftoverOf and the grocery
-- item `fresh` / `usedCost` fields live inside existing jsonb columns, so they
-- need no migration.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists time_schedule jsonb;

comment on column public.profiles.time_schedule is
  'Optional per-day, per-meal cooking time: {"mon":{"breakfast":"little",...},...}';
