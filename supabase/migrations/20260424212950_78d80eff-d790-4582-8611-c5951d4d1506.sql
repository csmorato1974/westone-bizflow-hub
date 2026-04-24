-- Recreate profiles update policy with explicit WITH CHECK clause
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;

CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING ((id = auth.uid()) OR is_admin(auth.uid()))
WITH CHECK ((id = auth.uid()) OR is_admin(auth.uid()));