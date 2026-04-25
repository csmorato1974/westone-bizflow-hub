UPDATE public.whatsapp_templates
SET mensaje = 'Hola {contacto}, bienvenido a Westone Performance. Estamos a tu disposición para tus pedidos de refrigerantes, anticongelantes y productos Heavy Duty. Da de alta tu cuenta en nuestra aplicación aquí: https://westone-bizflow-hub.lovable.app',
    updated_at = now()
WHERE clave = 'bienvenida';