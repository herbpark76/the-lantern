/*
# Writing chapters on demand

Interview sessions now only update the story bible. Chapters are written when the author
clicks "Create next chapter" in Studio > Book: a placeholder row is created with
generating = true and filled in the background; gen_error records a failure.
*/

ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS generating boolean NOT NULL DEFAULT false;
ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS gen_error text;
