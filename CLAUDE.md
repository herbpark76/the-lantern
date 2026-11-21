# CLAUDE.md: The Lantern

Herb's story platform: books and chapters, Formulaic (interactive story), ghostwriter interview mode (used for "Red Earth", Mom's story, interviews in Korean), ElevenLabs narration, and screenplay conversion. Home of the Last Flight novella.

## Where things live
- Live: https://the-lantern-mu.vercel.app (Vercel). Built originally in Bolt (https://bolt.new/~/sb1-znna3bsl).
- Supabase stores books and chapters as `book_docs` (e.g. `last-flight-novella/sample-01` … `-14`). **The Lantern (database) is the source of truth for chapter text**; `books/<book>/chapter-NN.md` in this repo is a copy.
- Other folders: `content/`, `interviews/`, `books/`.
- Project notes: Dropbox `/1 Work/Claude Projects/Creative Writing Project/` (`last-flight-novella-notes.md`, `lantern-platform-notes.md`, `lantern-interview-mode-spec.md`, Formulaic story bible and outline).

## Stack and commands
React + TypeScript + Vite + Tailwind, Supabase, Edge Functions.
- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`

## Narration
- Single voice (Herb's decision): ElevenLabs "Matthew" (voice id `kNjmAhXxYgxjF0oyxw4c`), model **eleven_v4** (about 13–16k credits per chapter; Herb has ~121k credits a month, so ask before re-recording many chapters).
- Recording runs through the Edge Function `book-audio-batch`: POST `{ids:[...]}` with header `x-batch-token`. The token isn't stored anywhere durable; rotate it again (with Herb's OK) when needed. Failures land in `book_docs.gen_error`.
- Reuse The Lantern's recordings for the webtoon; don't record separately.
- `webtoon-audio-export` is a stub (410) and can be deleted.

## Writing rules for Last Flight
- Plain, spare voice with dry wit (Vonnegut/Bradbury restraint); close third on Jack.
- At most a few similes per chapter; no aphorisms ending sections; don't explain subtext; no "It wasn't X. It was Y."; Leo is the only comedian.

## Housekeeping
- A stray `Claude outputs/` folder is committed at the repo root; delete it when convenient.
