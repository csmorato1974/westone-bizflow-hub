UPDATE public.productos
  SET presentaciones = array_replace(presentaciones, '4L', '5L')
  WHERE '4L' = ANY(presentaciones);

UPDATE public.producto_variantes
  SET presentacion = '5L'
  WHERE presentacion = '4L';

UPDATE public.pedido_items
  SET presentacion = '5L'
  WHERE presentacion = '4L';