-- Asegurar bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatares', 'avatares', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Recrear políticas de forma idempotente
DROP POLICY IF EXISTS "Avatares públicos lectura" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios suben su propio avatar" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios actualizan su propio avatar" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios borran su propio avatar" ON storage.objects;

-- Lectura pública del bucket de avatares
CREATE POLICY "Avatares públicos lectura"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatares');

-- Subida sólo dentro de la carpeta del propio usuario
CREATE POLICY "Usuarios suben su propio avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatares'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Actualización sólo de archivos propios
CREATE POLICY "Usuarios actualizan su propio avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatares'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatares'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Borrado sólo de archivos propios
CREATE POLICY "Usuarios borran su propio avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatares'
  AND auth.uid()::text = (storage.foldername(name))[1]
);