/*
# Interview Mode: Korean summary
Adds a short Korean summary of each session, written for the person interviewed
to read and correct ("이렇게 들었어요 — 맞나요?").
*/
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS summary_ko text;
