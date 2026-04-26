-- Reforzar protección del super_admin frente a admins normales

-- USER_ROLES
DROP POLICY IF EXISTS roles_admin_manage ON public.user_roles;

CREATE POLICY roles_super_admin_manage ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY roles_admin_manage_non_super ON public.user_roles
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(user_id, 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role <> 'super_admin'::public.app_role
    AND NOT public.has_role(user_id, 'super_admin'::public.app_role)
  );

-- PROFILES
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;

CREATE POLICY profiles_super_admin_all ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY profiles_admin_non_super ON public.profiles
  FOR ALL
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND NOT public.has_role(id, 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND NOT public.has_role(id, 'super_admin'::public.app_role)
  );