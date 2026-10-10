/*
# Interview modes + several interviews per person

- interview_subjects.mode: 'memoir' (life-story interviews, e.g. red-earth) or
  'ghostwriter' (develops a story idea by interview, then drafts a story bible,
  outline and opening chapter).
- One account can now have one interview per book (unique on user + story),
  so the same person can run e.g. a memoir test and a ghostwriter workspace.
*/

ALTER TABLE interview_subjects ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'memoir';

DO $$ BEGIN
  ALTER TABLE interview_subjects ADD CONSTRAINT interview_subjects_mode_check CHECK (mode IN ('memoir', 'ghostwriter'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE interview_subjects DROP CONSTRAINT IF EXISTS interview_subjects_user_id_key;

DO $$ BEGIN
  ALTER TABLE interview_subjects ADD CONSTRAINT interview_subjects_user_story_key UNIQUE (user_id, story_slug);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
