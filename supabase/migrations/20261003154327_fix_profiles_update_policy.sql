/*
# Fix profiles UPDATE policies

## Overview
The previous migration created two UPDATE policies on profiles, but Postgres ANDs them together.
A non-admin could not update their own profile because the admin-only policy blocked them.
Replace with a single policy: users can update their own row, but only admins can change the role column.
*/

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_role_admin_only" ON profiles;

-- Single UPDATE policy: user can update their own row.
-- Role column changes are restricted to admins via a column-level GRANT revoke + re-grant approach.
-- Since we can't easily do column-level RLS, we use a trigger to block non-admin role changes.
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Trigger function: block role changes by non-admins
CREATE OR REPLACE FUNCTION guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT public.current_user_role() INTO current_role;
    IF current_role <> 'admin' THEN
      RAISE EXCEPTION 'Only admins can change profile roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION guard_profile_role() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON profiles;
CREATE TRIGGER trg_guard_profile_role
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profile_role();