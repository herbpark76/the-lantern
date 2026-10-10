/*
# Books: publishing, revision sessions, chapter versions

- interview_sessions.kind: 'interview' (develop the story) or 'revise' (the author gives
  notes on a chapter or the bible). target_doc names the chapter (book_docs.id) a revise
  session is about, or the chapter an interview session produced.
- book_docs.published: chapter is readable by anyone once its book (a stories row with
  settings.kind = 'book') is published.
- book_doc_versions: earlier text of a chapter, saved before each revision or restore.
*/

ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'interview';
DO $$ BEGIN
  ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_kind_check CHECK (kind IN ('interview', 'revise'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS target_doc text;

ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "book_docs_select_published" ON book_docs;
CREATE POLICY "book_docs_select_published" ON book_docs
  FOR SELECT TO anon, authenticated
  USING (
    published
    AND EXISTS (SELECT 1 FROM stories s WHERE s.slug = book_docs.story_slug AND s.status = 'published')
  );

CREATE TABLE IF NOT EXISTS book_doc_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text NOT NULL REFERENCES book_docs(id) ON DELETE CASCADE,
  title_en text NOT NULL DEFAULT '',
  title_ko text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  body_ko text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_doc_versions_doc_idx ON book_doc_versions (doc_id, created_at DESC);

ALTER TABLE book_doc_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_doc_versions_select" ON book_doc_versions;
CREATE POLICY "book_doc_versions_select" ON book_doc_versions
  FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM book_docs d JOIN interview_subjects s ON s.story_slug = d.story_slug
      WHERE d.id = book_doc_versions.doc_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "book_doc_versions_insert_staff" ON book_doc_versions;
CREATE POLICY "book_doc_versions_insert_staff" ON book_doc_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
