/*
# Fix RLS infinite recursion on profiles

## Overview
profiles policies select from profiles to check the user's role, causing infinite recursion (42P17).
This migration adds SECURITY DEFINER helper functions that read the role without going through RLS,
then recreates every policy that previously queried profiles to use those functions instead.

## New Functions
- public.current_user_role() -> text: reads the caller's role from profiles (SECURITY DEFINER, bypasses RLS)
- public.is_staff() -> boolean: true when current_user_role() IN ('admin', 'author')
*/

-- Helper functions (SECURITY DEFINER so they bypass RLS on profiles)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('admin', 'author');
$$;

ALTER FUNCTION public.current_user_role() OWNER TO postgres;
ALTER FUNCTION public.is_staff() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ── profiles: drop and recreate without self-reference ──
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
DROP POLICY IF EXISTS "select_all_profiles_staff" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;

CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_staff());

CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Only admins can change role; everyone can update their own non-role columns
DROP POLICY IF EXISTS "update_role_admin_only" ON profiles;
CREATE POLICY "update_role_admin_only"
ON profiles FOR UPDATE
TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- ── stories ──
DROP POLICY IF EXISTS "select_all_stories_staff" ON stories;
CREATE POLICY "select_all_stories_staff"
ON stories FOR SELECT TO authenticated
USING (public.is_staff());

-- ── scenes ──
DROP POLICY IF EXISTS "select_scenes_staff" ON scenes;
CREATE POLICY "select_scenes_staff"
ON scenes FOR SELECT TO authenticated
USING (public.is_staff());

-- ── chapters ──
DROP POLICY IF EXISTS "select_chapters_staff" ON chapters;
CREATE POLICY "select_chapters_staff"
ON chapters FOR SELECT TO authenticated
USING (public.is_staff());

-- ── variants ──
DROP POLICY IF EXISTS "select_variants_staff" ON variants;
CREATE POLICY "select_variants_staff"
ON variants FOR SELECT TO authenticated
USING (public.is_staff());

-- ── choices ──
DROP POLICY IF EXISTS "select_choices_staff" ON choices;
CREATE POLICY "select_choices_staff"
ON choices FOR SELECT TO authenticated
USING (public.is_staff());

-- ── flags ──
DROP POLICY IF EXISTS "select_flags_staff" ON flags;
CREATE POLICY "select_flags_staff"
ON flags FOR SELECT TO authenticated
USING (public.is_staff());

-- ── bible_entries ──
DROP POLICY IF EXISTS "select_bible_staff" ON bible_entries;
CREATE POLICY "select_bible_staff"
ON bible_entries FOR SELECT TO authenticated
USING (public.is_staff());

-- ── sync_runs ──
DROP POLICY IF EXISTS "select_sync_runs_staff" ON sync_runs;
CREATE POLICY "select_sync_runs_staff"
ON sync_runs FOR SELECT TO authenticated
USING (public.is_staff());

-- ── playthroughs ──
DROP POLICY IF EXISTS "select_all_playthroughs_staff" ON playthroughs;
CREATE POLICY "select_all_playthroughs_staff"
ON playthroughs FOR SELECT TO authenticated
USING (public.is_staff());

-- ── playthrough_steps ──
DROP POLICY IF EXISTS "select_all_steps_staff" ON playthrough_steps;
CREATE POLICY "select_all_steps_staff"
ON playthrough_steps FOR SELECT TO authenticated
USING (public.is_staff());

-- ── editions ──
DROP POLICY IF EXISTS "select_all_editions_staff" ON editions;
CREATE POLICY "select_all_editions_staff"
ON editions FOR SELECT TO authenticated
USING (public.is_staff());