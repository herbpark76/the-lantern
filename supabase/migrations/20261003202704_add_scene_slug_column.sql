/*
# Add slug column to scenes table

1. Modified Tables
- `scenes`: adds optional `slug` text column to store a scene's place/time label
  (e.g. "Bel Air · 6:38 a.m.") that appears above the scene title in the Reader.
2. Security
- No RLS policy changes — the new column is covered by existing scene policies.
3. Notes
- The column is nullable; scenes without a slug show nothing in that label slot.
- sync-content edge function will be updated to read `slug` from scene frontmatter.
*/

ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS slug text;
