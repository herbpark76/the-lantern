/*
# Add start_scene column to stories

## Overview
Stories can now declare an explicit start scene in story.yaml. This is stored
in the new `start_scene` text column. When set, new playthroughs begin at that
scene instead of falling back to the old heuristic (first scene alphabetically
or by position).

## Changes
- `stories.start_scene` (text, nullable) — the scene key where new playthroughs
  begin. NULL means use the existing fallback logic.
*/

ALTER TABLE stories ADD COLUMN IF NOT EXISTS start_scene text;