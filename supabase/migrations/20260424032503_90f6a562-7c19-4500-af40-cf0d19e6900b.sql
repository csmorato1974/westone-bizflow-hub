CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP POLICY IF EXISTS "notif_insert_auth" ON public.notificaciones;
CREATE POLICY "notif_insert_scoped" ON public.notificaciones FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR user_id = auth.uid() OR
  public.has_role(auth.uid(),'vendedor') OR public.has_role(auth.uid(),'cliente'));