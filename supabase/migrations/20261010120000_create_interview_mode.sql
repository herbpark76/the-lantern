/*
# Interview Mode

## Overview
Voice interviews for memoir-style books (first use: Herb's mom, book `red-earth`).
The subject talks on her phone at /interview; an AI interviewer asks questions in
Korean (Claude API + ElevenLabs speech-to-text and text-to-speech). Staff review
sessions in Studio > Interviews.

## Tables
- interview_subjects: one row per person being interviewed (linked to their auth user)
- interview_sessions: one sitting (status active -> finished), plus summary outputs
- interview_turns: each spoken line, by subject or interviewer, with audio path

## Storage
- Private bucket `interviews` for both sides' audio. Only edge functions
  (service role) write; clients get short-lived signed URLs from the functions.

## Security
- Subjects can read their own subject row, sessions and turns.
- Staff (author/admin) can read everything and edit subject settings.
- All other writes go through edge functions using the service role.
*/

CREATE TABLE IF NOT EXISTS interview_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  story_slug text NOT NULL,
  display_name text NOT NULL,
  language text NOT NULL DEFAULT 'ko',
  honorific text NOT NULL DEFAULT '어머니',
  tts_voice_id text NOT NULL DEFAULT 'UzElYEdLTwdjry68bt1c',
  tts_model_id text NOT NULL DEFAULT 'eleven_v3',
  tts_speed numeric NOT NULL DEFAULT 0.92,
  next_era text NOT NULL DEFAULT 'books',
  interviewer_notes text NOT NULL DEFAULT '',
  off_limits text[] NOT NULL DEFAULT '{}',
  background text NOT NULL DEFAULT '',
  monthly_budget_usd numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES interview_subjects(id) ON DELETE CASCADE,
  session_no integer NOT NULL,
  era text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finishing', 'finished')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  transcript_ko text,
  transcript_en text,
  summary_en text,
  scene_notes text,
  followups text,
  github_path text,
  github_error text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tts_chars integer NOT NULL DEFAULT 0,
  stt_seconds numeric NOT NULL DEFAULT 0,
  est_cost_usd numeric NOT NULL DEFAULT 0,
  UNIQUE (subject_id, session_no)
);

CREATE INDEX IF NOT EXISTS interview_sessions_subject_idx ON interview_sessions (subject_id, started_at DESC);

CREATE TABLE IF NOT EXISTS interview_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  turn_no integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('subject', 'interviewer')),
  text text NOT NULL DEFAULT '',
  audio_path text,
  duration_ms integer,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_no)
);

ALTER TABLE interview_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_turns ENABLE ROW LEVEL SECURITY;

-- subjects
DROP POLICY IF EXISTS "interview_subjects_select" ON interview_subjects;
CREATE POLICY "interview_subjects_select" ON interview_subjects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "interview_subjects_update_staff" ON interview_subjects;
CREATE POLICY "interview_subjects_update_staff" ON interview_subjects
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- sessions
DROP POLICY IF EXISTS "interview_sessions_select" ON interview_sessions;
CREATE POLICY "interview_sessions_select" ON interview_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR subject_id IN (SELECT id FROM interview_subjects WHERE user_id = auth.uid())
  );

-- turns
DROP POLICY IF EXISTS "interview_turns_select" ON interview_turns;
CREATE POLICY "interview_turns_select" ON interview_turns
  FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR session_id IN (
      SELECT s.id FROM interview_sessions s
      JOIN interview_subjects subj ON subj.id = s.subject_id
      WHERE subj.user_id = auth.uid()
    )
  );

-- Private storage bucket for interview audio (service role writes, signed URLs to read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('interviews', 'interviews', false)
ON CONFLICT (id) DO NOTHING;
