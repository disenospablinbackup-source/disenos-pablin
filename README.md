# Diseños Pablin

Sitio estático con funciones Node.js en Vercel y datos en Supabase.

## Antes de activar esta versión

1. Revocar la contraseña de aplicación de Gmail y la clave Gemini expuestas en el historial público. Crear credenciales nuevas; no reutilizar las anteriores. Borrarlas del código no las revoca. No pegarlas en issues, PR ni mensajes.
2. Hacer respaldo de Supabase e inspeccionar tablas, tipos, políticas y funciones existentes. La migración presupone las columnas utilizadas por la aplicación anterior; debe comprobarse contra el esquema real antes de producción.
3. Crear una cuenta en Supabase Auth para cada administrador. Asignar `app_metadata.role = "admin"` con herramientas administrativas seguras; `user_metadata` no concede permisos. No habilitar registro público de administradores. Cerrar sesión y volver a entrar después de asignar el rol.
4. Probar `supabase/migrations/20260928_security.sql` en una base de ensayo y después aplicarla a producción durante una ventana de mantenimiento. Sustituye todas las políticas previas de `clientes`, `tecnicos`, `obras`, `avances_obra` y `chats`; revisar accesos de otras integraciones. Rotará los enlaces cortos existentes, guardando una copia de los anteriores en `private.tracking_token_backup`, inaccesible para los clientes de la API. Los clientes necesitarán recibir los nuevos enlaces desde el panel; esta migración no envía mensajes.
5. Configurar en Vercel las variables de `.env.example`. Preview debe usar su propia base y credenciales de prueba. `SITE_URL` es la URL HTTPS de ese entorno. `SUPABASE_PUBLISHABLE_KEY` debe ser una clave publicable, nunca una clave secret/service_role. No se necesita una clave de servicio.
6. Elegir un modelo de Gemini disponible en la cuenta y asignar su identificador a `GEMINI_MODEL`. Gemini 1.5 está bloqueado; no hay fallback a un modelo retirado.
7. Desplegar primero una vista previa. Verificar acceso anónimo denegado al panel/datos, acceso administrador, creación de obra, correo a una dirección de prueba controlada, seguimiento y reseña única. Solo después activar producción.

## Variables

| Variable | Uso |
|---|---|
| SUPABASE_URL | URL del proyecto del entorno |
| SUPABASE_PUBLISHABLE_KEY | Clave publicable, compartida con el navegador |
| GMAIL_USER | Cuenta emisora |
| GMAIL_PASS | Nueva contraseña de aplicación Gmail, solo servidor |
| SITE_URL | Origen HTTPS para enlaces enviados por correo |
| GEMINI_API_KEY | Nueva clave Gemini, solo servidor |
| GEMINI_MODEL | Modelo vigente habilitado en la cuenta |

## Comportamiento de seguridad

- El panel usa Supabase Auth. Las políticas de base de datos son la protección real, no la pantalla de acceso.
- Correo y asistente verifican cada sesión con Supabase y requieren `app_metadata.role = admin`.
- Correo: el destinatario y el contenido salen de la obra registrada; se ignoran los valores enviados por el navegador. Límite compartido entre instancias: diez solicitudes por administrador y minuto por acción, almacenado en Postgres.
- El seguimiento público usa un código aleatorio de 128 bits y funciones SQL de campos limitados. No publica correos, cédulas, teléfonos, IDs internos ni notas internas. Quien tenga el enlace puede ver esos campos y dejar una sola reseña al finalizar la obra; conservar el enlace como privado. La reseña no permite modificar otros campos.
- El asistente es solo de consulta/redacción y no lee datos de clientes ni ejecuta cambios. El antiguo webhook público de WhatsApp queda cerrado. Para restablecer esa integración se requiere verificación de firma, asociación fiable de remitentes, autorización por obra e idempotencia; no está implementada en esta versión.
- Los límites de IP para el seguimiento público se pueden añadir en Vercel Firewall. No confundir el límite por administrador con protección global contra tráfico masivo.
- Desactivar un administrador requiere renovar/revocar sus sesiones: las políticas basadas en JWT pueden conservar permisos hasta expirar el token.

## Desarrollo y pruebas

Node.js 24:

```sh
npm ci
npm test
npm run build
```

El build copia únicamente las páginas y el SDK de navegador fijado en el lockfile a `public/`. Vercel sirve esa carpeta y las funciones de `api/`. No publica los archivos de pruebas, SQL o configuración como contenido estático.

Las pruebas no usan credenciales reales ni envían correo. Cubren sesiones, roles, destinatario, escape HTML, errores del proveedor, límites, bloqueo de acciones IA y políticas SQL sobre Postgres local (PGlite). Incluyen una copia de la estructura verificada del proyecto Supabase (tipos, restricciones y relaciones), sin datos de clientes. La copia se encuentra en `tests/fixtures/production-schema.sql`. También comprueban la conservación de registros y la copia privada de códigos de seguimiento.

## Referencias

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://ai.google.dev/gemini-api/docs/changelog#september-29-2025
- https://vercel.com/docs/environment-variables
