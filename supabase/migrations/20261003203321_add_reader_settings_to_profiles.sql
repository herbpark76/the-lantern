/*
# Add reader_settings column to profiles

1. Modified Tables
- `profiles`: adds an optional `reader_settings` jsonb column to persist
  per-user reading display preferences (text size, line spacing, column width).
2. Security
- No RLS policy changes — the existing profiles policies already restrict
  SELECT/UPDATE to the owning user via auth.uid() = id.
3. Notes
- The column is nullable; users who have never adjusted settings have NULL.
- The frontend writes a JSON object like {"textSize":18,"lineSpacing":1.8,"width":"normal"}.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reader_settings jsonb DEFAULT NULL;
