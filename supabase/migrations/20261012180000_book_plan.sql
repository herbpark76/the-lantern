/*
# Book plan

The story bible row (<slug>/bible) carries a machine-readable plan of the whole book:
format and target length, the three acts, major plot points, and every chapter with its
act, beats and target word count. Chapter writing follows the plan for that chapter.
*/

ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS plan jsonb;
