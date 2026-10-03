/*
# Add `when` column to chapters for conditional chapters

## Overview
Chapters can now be conditionally shown based on the reader's flags and timeline.
Authors embed an HTML comment like `<!-- when: {"path_taken": "left"} -->` on the
line immediately after a `## Title` heading. The sync-content edge function parses
that comment, removes it from the stored body, and stores the JSON condition in the
new `when` jsonb column.

## Changes
- `chapters."when"` (jsonb, default '{}') — condition for when to show the chapter.
  Keys must be declared flags (from flags.yaml) or the reserved keys
  `timeline` / `timeline_gte`. An empty object `{}` means always show.
*/

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS "when" jsonb NOT NULL DEFAULT '{}'::jsonb;