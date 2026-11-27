/*
# The Lantern rehaul: works, versions, reviews and craft scorecards

The site becomes a repository of Herb's stories. Each **work** (a story) has formats
(novella, screenplay, ...) and each format has frozen **versions**. A version's text is a
list of **sections** (chapters for prose, acts/sequences for a screenplay). Versions never
change after they are made, so review comments stay anchored to the text they were made on.

- works:           one per story, with the Story Hub (logline, beats, 3-act map, characters,
                   key points) in `hub` jsonb, and `links` to formats that live elsewhere on
                   the site (the interactive reader, the narrated book).
- work_versions:   a frozen version of one format ("Screenplay v9", "Novella final edit").
- work_sections:   the text of a version, one row per chapter / act.
- review_rounds:   a review of one version: instructions, due date, questions.
- reviewers:       people invited to a round. Each gets a private link (token); no account.
- review_notes:    comments, suggested edits, paragraph reactions and chapter "pulse" ratings.
- review_answers:  answers to the round's questions.
- craft_runs:      background Claude jobs: red/yellow/green scorecards, Story Hub drafts,
                   review summaries.

Staff (author/admin) can read and write everything. Reviewers never touch these tables
directly: the `review` edge function checks their token and works with the service role.
Works marked public, and their public versions, can be read by anyone.
*/

-- ── Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS works (
  slug text PRIMARY KEY,
  title text NOT NULL,
  logline text NOT NULL DEFAULT '',
  blurb text NOT NULL DEFAULT '',
  accent_color text NOT NULL DEFAULT '#c97b3a',
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  position integer NOT NULL DEFAULT 0,
  hub jsonb NOT NULL DEFAULT '{}'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_slug text NOT NULL REFERENCES works(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  format text NOT NULL CHECK (format IN ('novel', 'novella', 'screenplay', 'short', 'treatment', 'webtoon', 'other')),
  label text NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'current', 'archived')),
  lang text NOT NULL DEFAULT 'en',
  public boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT '',
  parent_id uuid REFERENCES work_versions(id) ON DELETE SET NULL,
  word_count integer NOT NULL DEFAULT 0,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_versions_work_idx ON work_versions (work_slug, format, created_at DESC);

CREATE TABLE IF NOT EXISTS work_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  UNIQUE (version_id, position)
);

CREATE TABLE IF NOT EXISTS review_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  due_at date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  show_others boolean NOT NULL DEFAULT false,
  -- [{ id, text, section: null | <section position> }]
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_rounds_version_idx ON review_rounds (version_id);

CREATE TABLE IF NOT EXISTS reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  -- { last_section: <position>, done: [<position>, ...] }
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  last_seen_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviewers_round_idx ON reviewers (round_id);

CREATE TABLE IF NOT EXISTS review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES reviewers(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES work_sections(id) ON DELETE CASCADE,
  -- Where in the section: block index (paragraph / screenplay element) and character
  -- offsets in that block's plain text. Null block = about the whole section.
  block integer,
  start_at integer,
  end_at integer,
  quote text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('comment', 'suggest', 'reaction', 'pulse')),
  body text NOT NULL DEFAULT '',
  replacement text,
  reaction text CHECK (reaction IS NULL OR reaction IN ('loved', 'slow', 'confused', 'unconvinced', 'funny', 'moved')),
  score integer CHECK (score IS NULL OR score BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'resolved')),
  author_reply text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_notes_round_idx ON review_notes (round_id, section_id);

CREATE TABLE IF NOT EXISTS review_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES reviewers(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  answer text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewer_id, question_id)
);

CREATE TABLE IF NOT EXISTS craft_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('score', 'hub', 'summary')),
  work_slug text REFERENCES works(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  version_id uuid REFERENCES work_versions(id) ON DELETE CASCADE,
  round_id uuid REFERENCES review_rounds(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  result jsonb,
  error text,
  usage jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS craft_runs_version_idx ON craft_runs (version_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS craft_runs_work_idx ON craft_runs (work_slug, kind, created_at DESC);

-- ── Row level security ────────────────────────────────────────────────

ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE craft_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['works','work_versions','work_sections','review_rounds','reviewers','review_notes','review_answers','craft_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_staff_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', t || '_staff_all', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "works_public_select" ON works;
CREATE POLICY "works_public_select" ON works
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS "work_versions_public_select" ON work_versions;
CREATE POLICY "work_versions_public_select" ON work_versions
  FOR SELECT TO anon, authenticated
  USING (public AND EXISTS (SELECT 1 FROM works w WHERE w.slug = work_versions.work_slug AND w.visibility = 'public'));

DROP POLICY IF EXISTS "work_sections_public_select" ON work_sections;
CREATE POLICY "work_sections_public_select" ON work_sections
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM work_versions v JOIN works w ON w.slug = v.work_slug
    WHERE v.id = work_sections.version_id AND v.public AND w.visibility = 'public'
  ));

-- ── Seed: the three works ─────────────────────────────────────────────

INSERT INTO works (slug, title, logline, blurb, accent_color, position, links, hub) VALUES
(
  'last-flight',
  'The Last Flight to Clarksville',
  'Snowed in overnight at a brand-new terminal, a bestselling novelist who has stopped feeling anything is sealed in with four strangers, and the clues that none of them are real all point back at him.',
  'A slow-burn Twilight Zone night in an airport terminal. Novella and feature screenplay.',
  '#4a6f8a',
  1,
  '[{"format":"listening","label":"Listening edition (narrated novella)","href":"/book/last-flight-novella"}]'::jsonb,
  $hub${
    "genre": "Psychological sci-fi mystery / slow burn (Twilight Zone, Into the Night, Edge of Tomorrow)",
    "theme": "Feeling something is worth the cost of it. Knowing what something is doesn't change how it makes you feel.",
    "premise": "In a numb future, people run simulations to relearn that life matters. Jack Marsh is the simulation's lead architect and its test subject: he wiped his memory and built himself a stock character, a bestselling novelist, because a blank slate was the only way past his numbness.",
    "acts": [
      {"act": 1, "summary": "The cancelled flight, Jack's line-cutting, the walk to the new Terminal 9, the lockdown. Five strangers sealed in; the thirteen-minute thuds begin.", "prose": "", "screen": ""},
      {"act": 2, "summary": "Clues pile up and every alibi gets a hole: the missing PERIM key, the pockets, Ray's blanks, the empty body. Theories (test, experiment, simulation). Jack builds a persuasive case against Hattie, then atones by staying with her. Low point: none of them are real and the night ends at sunrise.", "prose": "", "screen": ""},
      {"act": 3, "summary": "Jack realizes he wrote the script, so he can break it. The door at sunrise, the goodbyes, waking in the pod, fourteen runs, signing his name on the records, and finding the real Anna at Pelican Lake.", "prose": "", "screen": ""}
    ],
    "beats": [],
    "characters": [
      {"name": "Jack Marsh", "role": "Protagonist", "want": "Get to his Saturday keynote; get out of the terminal", "need": "To feel something and own what he did", "arc": "Slimy, never hated (Cage in Edge of Tomorrow) to a man who signs his name to what he built", "notes": "Silver watch, left wrist. No link to the other four: pays off as the architect."},
      {"name": "Anna", "role": "Love interest / mirror", "want": "To be left alone with her grief", "need": "", "arc": "Keeps her own arc; not rescued by Jack. Real donor who had her grief archived.", "notes": "Barely talks to Jack until the 4:50 book scene (Rita-style). Late husband Ben called her Annie. Lies that she hasn't read Jack's book."},
      {"name": "Hattie", "role": "Mentor / scapegoat", "want": "", "need": "", "arc": "", "notes": "Older Black woman, night janitor, Oracle-like. Ex-founder of Thibodeaux Systems. Birkin bag used as a lunch sack. \"Function: gives the room someone to blame.\""},
      {"name": "Ray Dunn", "role": "Threat / suspect", "want": "", "need": "", "arc": "", "notes": "East Asian, 50s, federal agent type, ex-Air Force sound-tech program. Plain No Country speech. Keeps his own gun."},
      {"name": "Leo Brandt", "role": "Comic relief / suspect", "want": "", "need": "", "arc": "", "notes": "Hispanic, wiry fast-talking lawyer. The only comedian. Closed the Meridian merger without reading page 212."}
    ],
    "points": [
      {"kind": "decision", "text": "Last line stays \"He smiled.\""},
      {"kind": "decision", "text": "Jack never says \"I'm sorry\" to Hattie; \"I was showing off\" stays."},
      {"kind": "decision", "text": "No \"I love you\" at the door: \"I wish we'd met somewhere else\" / \"You'd have cut in front of me\" / \"I'd have liked to know you\" / \"You do.\""},
      {"kind": "decision", "text": "The Fibonacci birthdays stay cut. Nobody in the terminal took the PERIM key: the experimenters removed it."},
      {"kind": "decision", "text": "No real-world adjustment section after Jack wakes; Castaway/Shawshank beats where he misses the place that trapped him."},
      {"kind": "continuity", "text": "Thud timeline and thirteen-minute interval; Ch 11 quotes the Ch 7 line \"The thud came at 2:43…\" word for word."},
      {"kind": "continuity", "text": "Fifty-six people behind Jack at the gate; keynote at noon on Saturday."},
      {"kind": "continuity", "text": "Anna says she hasn't read Jack's book (Ch 1); she admits the lie in Ch 12."},
      {"kind": "style", "text": "No em dashes. \"Said\" without adverbs. Leo is the only comedian. Nobody names a feeling outright."}
    ]
  }$hub$::jsonb
),
(
  'red-earth',
  'Red Earth',
  'A family saga that follows one Daegu girl from the winter of 1961 to a life in Norman, Oklahoma.',
  'A Korean period family drama based on Herb''s mother''s life. Korean and English.',
  '#a0522d',
  2,
  '[]'::jsonb,
  '{"genre": "Korean period family saga (To Live, Ode to My Father, Minari)", "premise": "Present-day frame plus her past in close third person; fictionalized but true at heart; structured by era and decade.", "acts": [], "beats": [], "characters": [], "points": []}'::jsonb
),
(
  'formulaic',
  COALESCE((SELECT title FROM stories WHERE slug = 'formulaic'), 'Formulaic'),
  '',
  COALESCE((SELECT blurb FROM stories WHERE slug = 'formulaic'), 'An interactive branching story.'),
  '#6b5b95',
  3,
  '[{"format":"interactive","label":"Interactive edition (choose your path)","href":"/story/formulaic"}]'::jsonb,
  '{"acts": [], "beats": [], "characters": [], "points": []}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: versions copied from the existing Studio books ──────────────
-- book_docs stays the working draft (Studio edits and narration). These are frozen copies.

CREATE OR REPLACE FUNCTION pg_temp.seed_version(
  p_work text, p_format text, p_label text, p_status text, p_lang text, p_story text, p_notes text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM work_versions WHERE work_slug = p_work AND source = 'book_docs:' || p_story || ':' || p_lang) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM book_docs WHERE story_slug = p_story AND kind = 'sample'
                 AND (CASE WHEN p_lang = 'ko' THEN body_ko ELSE body_en END) <> '') THEN RETURN; END IF;
  INSERT INTO work_versions (work_slug, format, label, status, lang, source, notes)
  VALUES (p_work, p_format, p_label, p_status, p_lang, 'book_docs:' || p_story || ':' || p_lang, p_notes)
  RETURNING id INTO v;
  INSERT INTO work_sections (version_id, position, title, body)
  SELECT v, row_number() OVER (ORDER BY position),
         CASE WHEN p_lang = 'ko' THEN COALESCE(NULLIF(title_ko, ''), title_en) ELSE COALESCE(NULLIF(title_en, ''), title_ko) END,
         CASE WHEN p_lang = 'ko' THEN body_ko ELSE body_en END
  FROM book_docs
  WHERE story_slug = p_story AND kind = 'sample' AND NOT generating
    AND (CASE WHEN p_lang = 'ko' THEN body_ko ELSE body_en END) <> '';
  UPDATE work_versions SET word_count = (
    SELECT COALESCE(sum(array_length(regexp_split_to_array(trim(body), '\s+'), 1)), 0) FROM work_sections WHERE version_id = v
  ) WHERE id = v;
END $$;

SELECT pg_temp.seed_version('last-flight', 'novella', 'Final edit (16 chapters)', 'current', 'en', 'last-flight-novella',
  'Herb''s FINAL EDIT revision, Nov 26, 2026. Same text as the Word file sent to his sister.');
SELECT pg_temp.seed_version('last-flight', 'novella', 'First draft: "Last Exit" (10 chapters)', 'archived', 'en', 'last exit',
  'The October ghostwriter draft, before the slow-burn rewrite and the renames.');
SELECT pg_temp.seed_version('last-flight', 'screenplay', 'Early draft (Nov 6, Declan names)', 'archived', 'en', 'last-flight-screenplay',
  'The screenplay as it was on the site on Nov 6. Upload v9 (.fountain) as the current version.');
SELECT pg_temp.seed_version('red-earth', 'novel', 'Chapters 1-2 (English)', 'current', 'en', 'red-earth', 'Revised Chapters 1 and 2, Oct 11, 2026.');
SELECT pg_temp.seed_version('red-earth', 'novel', '1-2장 (한국어)', 'current', 'ko', 'red-earth', 'Korean original of the revised Chapters 1 and 2.');
