/*
# Fix narration bucket storage policies

## Overview
The `narration` bucket was created as public but had no explicit storage.objects
policies, so uploads from the edge function's service-role client could fail
depending on the RLS state. This migration adds:

1. A SELECT policy allowing anyone (anon + authenticated) to read objects in
   the `narration` bucket — required for the browser to stream MP3s.
2. An INSERT policy allowing only the service role (which bypasses RLS) to
   upload objects. Since RLS is bypassed by the service role, the policy on
   `TO authenticated` with `WITH CHECK (false)` blocks authenticated users
   from uploading directly, while the service-role client skips RLS entirely.

## Security
- Public read on `narration` bucket objects (intentional — audio must stream
  to all readers).
- No direct user uploads to the bucket; only the edge function's service-role
  client can write.
*/

-- Public read for narration bucket objects
DROP POLICY IF EXISTS "narration_bucket_public_read" ON storage.objects;
CREATE POLICY "narration_bucket_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'narration');

-- Block direct authenticated inserts (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "narration_bucket_no_user_insert" ON storage.objects;
CREATE POLICY "narration_bucket_no_user_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (false);
