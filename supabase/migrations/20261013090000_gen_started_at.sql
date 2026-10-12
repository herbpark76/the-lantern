/*
# When background writing started

book_docs.gen_started_at is set whenever generating becomes true, so Studio can tell a job
that is still running from one that died (e.g. hit the function time limit) and offer a retry.
*/

ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS gen_started_at timestamptz;
