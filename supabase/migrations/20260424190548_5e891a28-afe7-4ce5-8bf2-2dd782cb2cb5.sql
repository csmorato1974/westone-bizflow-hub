-- Vendedor puede ver perfiles de los usuarios de sus clientes asignados
CREATE POLICY "profiles_vendedor_ve_clientes"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.user_id = profiles.id
      AND c.vendedor_id = auth.uid()
  )
);

-- Cliente puede ver el perfil del vendedor asignado a su ficha de cliente
CREATE POLICY "profiles_cliente_ve_vendedor"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cliente'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.user_id = auth.uid()
      AND c.vendedor_id = profiles.id
  )
);