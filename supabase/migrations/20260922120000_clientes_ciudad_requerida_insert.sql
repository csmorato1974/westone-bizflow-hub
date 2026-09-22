-- Ciudad obligatoria SOLO en altas nuevas de clientes.
-- No valida UPDATE: los clientes históricos incompletos siguen editables.
-- No modifica ninguna fila existente.

CREATE OR REPLACE FUNCTION public.clientes_bi_ciudad_requerida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ciudad IS NULL OR btrim(NEW.ciudad) = '' THEN
    RAISE EXCEPTION 'Ciudad requerida' USING ERRCODE = '23514';
  END IF;
  NEW.ciudad := regexp_replace(btrim(NEW.ciudad), '\s+', ' ', 'g');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_bi_ciudad_requerida ON public.clientes;

CREATE TRIGGER clientes_bi_ciudad_requerida
BEFORE INSERT ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.clientes_bi_ciudad_requerida();