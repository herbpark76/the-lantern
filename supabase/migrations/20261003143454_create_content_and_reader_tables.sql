/*
# Create content mirror and reader tables

## Overview
Creates all tables for the branching novel platform: content mirror (synced from GitHub), reader progress, and editions. Also creates the choice_tallies view.

## New Tables
- stories, scenes, chapters, variants, choices, flags, bible_entries, sync_runs (content mirror)
- playthroughs, playthrough_steps, editions (reader data)
- choice_tallies (view)

## Security
- Content mirror: published stories readable by anon+authenticated; staff can read all; writes only via service role (bypasses RLS).
- playthroughs/steps/editions: readers see only their own; staff can see all.
- sync_runs: staff only.
- choice_tallies view uses security_invoker.
*/

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  slug text PRIMARY KEY,
  title text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_commit text,
  synced_at timestamptz
);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_stories" ON stories;
CREATE POLICY "select_published_stories"
ON stories FOR SELECT TO anon, authenticated
USING (status = 'published');

DROP POLICY IF EXISTS "select_all_stories_staff" ON stories;
CREATE POLICY "select_all_stories_staff"
ON stories FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Scenes
CREATE TABLE IF NOT EXISTS scenes (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL DEFAULT '',
  act int NOT NULL DEFAULT 1,
  is_bottleneck boolean NOT NULL DEFAULT false,
  is_ending boolean NOT NULL DEFAULT false,
  reads_flags text[] NOT NULL DEFAULT '{}',
  map_x int,
  map_y int,
  PRIMARY KEY (story_slug, key)
);
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_scenes_published" ON scenes;
CREATE POLICY "select_scenes_published"
ON scenes FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = scenes.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_scenes_staff" ON scenes;
CREATE POLICY "select_scenes_staff"
ON scenes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Chapters
CREATE TABLE IF NOT EXISTS chapters (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  scene_key text NOT NULL,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  PRIMARY KEY (story_slug, scene_key, position),
  FOREIGN KEY (story_slug, scene_key) REFERENCES scenes(story_slug, key) ON DELETE CASCADE
);
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_chapters_published" ON chapters;
CREATE POLICY "select_chapters_published"
ON chapters FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = chapters.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_chapters_staff" ON chapters;
CREATE POLICY "select_chapters_staff"
ON chapters FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Variants
CREATE TABLE IF NOT EXISTS variants (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  scene_key text NOT NULL,
  slot text NOT NULL,
  "when" jsonb NOT NULL DEFAULT '{}'::jsonb,
  text text NOT NULL DEFAULT '',
  priority int NOT NULL DEFAULT 0,
  FOREIGN KEY (story_slug, scene_key) REFERENCES scenes(story_slug, key) ON DELETE CASCADE
);
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_variants_published" ON variants;
CREATE POLICY "select_variants_published"
ON variants FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = variants.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_variants_staff" ON variants;
CREATE POLICY "select_variants_staff"
ON variants FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Choices
CREATE TABLE IF NOT EXISTS choices (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  scene_key text NOT NULL,
  key text NOT NULL,
  label text NOT NULL DEFAULT '',
  to_scene_key text NOT NULL,
  position int NOT NULL DEFAULT 0,
  sets jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (story_slug, scene_key, key),
  FOREIGN KEY (story_slug, scene_key) REFERENCES scenes(story_slug, key) ON DELETE CASCADE
);
ALTER TABLE choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_choices_published" ON choices;
CREATE POLICY "select_choices_published"
ON choices FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = choices.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_choices_staff" ON choices;
CREATE POLICY "select_choices_staff"
ON choices FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Flags
CREATE TABLE IF NOT EXISTS flags (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  key text NOT NULL,
  type text NOT NULL DEFAULT 'boolean' CHECK (type IN ('choice', 'boolean', 'number')),
  allowed_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (story_slug, key)
);
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_flags_published" ON flags;
CREATE POLICY "select_flags_published"
ON flags FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = flags.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_flags_staff" ON flags;
CREATE POLICY "select_flags_staff"
ON flags FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Bible entries
CREATE TABLE IF NOT EXISTS bible_entries (
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'character' CHECK (kind IN ('character', 'place', 'object', 'rule', 'plant')),
  key text NOT NULL,
  name text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  PRIMARY KEY (story_slug, key)
);
ALTER TABLE bible_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_bible_published" ON bible_entries;
CREATE POLICY "select_bible_published"
ON bible_entries FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM stories WHERE stories.slug = bible_entries.story_slug AND stories.status = 'published'));

DROP POLICY IF EXISTS "select_bible_staff" ON bible_entries;
CREATE POLICY "select_bible_staff"
ON bible_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Sync runs
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_slug text NOT NULL,
  commit_sha text,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ran_by uuid,
  result text NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'failed')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_sync_runs_staff" ON sync_runs;
CREATE POLICY "select_sync_runs_staff"
ON sync_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

-- Playthroughs
CREATE TABLE IF NOT EXISTS playthroughs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  timeline int NOT NULL DEFAULT 1,
  current_scene_key text NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  ending_scene_key text
);
ALTER TABLE playthroughs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_playthroughs_member ON playthroughs(member_id);
CREATE INDEX IF NOT EXISTS idx_playthroughs_story ON playthroughs(story_slug);

DROP POLICY IF EXISTS "select_own_playthroughs" ON playthroughs;
CREATE POLICY "select_own_playthroughs"
ON playthroughs FOR SELECT TO authenticated
USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "select_all_playthroughs_staff" ON playthroughs;
CREATE POLICY "select_all_playthroughs_staff"
ON playthroughs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

DROP POLICY IF EXISTS "insert_own_playthroughs" ON playthroughs;
CREATE POLICY "insert_own_playthroughs"
ON playthroughs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_own_playthroughs" ON playthroughs;
CREATE POLICY "update_own_playthroughs"
ON playthroughs FOR UPDATE TO authenticated
USING (auth.uid() = member_id) WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_own_playthroughs" ON playthroughs;
CREATE POLICY "delete_own_playthroughs"
ON playthroughs FOR DELETE TO authenticated
USING (auth.uid() = member_id);

-- Playthrough steps
CREATE TABLE IF NOT EXISTS playthrough_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  step_no int NOT NULL DEFAULT 0,
  scene_key text NOT NULL,
  choice_key text,
  timeline int NOT NULL DEFAULT 1,
  chosen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE playthrough_steps ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_steps_playthrough ON playthrough_steps(playthrough_id);

DROP POLICY IF EXISTS "select_own_steps" ON playthrough_steps;
CREATE POLICY "select_own_steps"
ON playthrough_steps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = playthrough_steps.playthrough_id AND playthroughs.member_id = auth.uid()));

DROP POLICY IF EXISTS "select_all_steps_staff" ON playthrough_steps;
CREATE POLICY "select_all_steps_staff"
ON playthrough_steps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

DROP POLICY IF EXISTS "insert_own_steps" ON playthrough_steps;
CREATE POLICY "insert_own_steps"
ON playthrough_steps FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = playthrough_steps.playthrough_id AND playthroughs.member_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_steps" ON playthrough_steps;
CREATE POLICY "delete_own_steps"
ON playthrough_steps FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = playthrough_steps.playthrough_id AND playthroughs.member_id = auth.uid()));

-- Editions
CREATE TABLE IF NOT EXISTS editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_slug text NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'directors_cut' CHECK (kind IN ('peoples_cut', 'directors_cut', 'your_story', 'anthology')),
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  audio_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_editions_member ON editions(member_id);
CREATE INDEX IF NOT EXISTS idx_editions_story ON editions(story_slug);

DROP POLICY IF EXISTS "select_own_editions" ON editions;
CREATE POLICY "select_own_editions"
ON editions FOR SELECT TO authenticated
USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "select_all_editions_staff" ON editions;
CREATE POLICY "select_all_editions_staff"
ON editions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('author', 'admin')));

DROP POLICY IF EXISTS "insert_own_editions" ON editions;
CREATE POLICY "insert_own_editions"
ON editions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_own_editions" ON editions;
CREATE POLICY "update_own_editions"
ON editions FOR UPDATE TO authenticated
USING (auth.uid() = member_id) WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_own_editions" ON editions;
CREATE POLICY "delete_own_editions"
ON editions FOR DELETE TO authenticated
USING (auth.uid() = member_id);

-- Choice tallies view
CREATE OR REPLACE VIEW choice_tallies AS
SELECT
  p.story_slug,
  ps.scene_key,
  ps.choice_key,
  COUNT(*) AS total_count,
  COUNT(CASE WHEN p.completed_at IS NOT NULL THEN 1 END) AS completed_count
FROM playthrough_steps ps
JOIN playthroughs p ON p.id = ps.playthrough_id
WHERE ps.choice_key IS NOT NULL
GROUP BY p.story_slug, ps.scene_key, ps.choice_key;

ALTER VIEW choice_tallies SET (security_invoker = true);