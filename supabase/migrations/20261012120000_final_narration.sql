/*
# Final narration for published books

Studio narration (book_docs.model_id, audio_en/audio_ko) is the working draft.
Published books play a separate "final" recording made with final_model_id,
stored in audio_final_en / audio_final_ko, so re-recording a draft in Studio
never changes what readers hear.
*/

ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS final_model_id text NOT NULL DEFAULT 'eleven_v4';
ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS audio_final_en jsonb;
ALTER TABLE book_docs ADD COLUMN IF NOT EXISTS audio_final_ko jsonb;
