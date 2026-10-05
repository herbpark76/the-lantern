/*
# Add is_preview column to playthroughs

1. Changes
- Adds `is_preview` boolean column to `playthroughs`, default false.
- Preview playthroughs are staff-only test reads that should be excluded
  from tallies, crowd splits, People's Cut, Readers stats, and finished-reads lists.
2. Security
- No RLS policy changes; existing playthroughs policies still apply.
- The column is included in the existing SELECT/INSERT/UPDATE grants.
*/

ALTER TABLE playthroughs
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;
