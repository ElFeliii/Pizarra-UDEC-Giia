# Revisión del repositorio de entrega

Revisión del 7 de octubre de 2026, aplicada a los archivos actuales de entrega, al paquete
y al historial vigente de la copia de publicación. La actualización queda preparada
localmente y todavía no se ha enviado a GitHub. El repositorio de desarrollo permanece
separado: su historial antiguo no forma parte de la entrega.

## Alcance de la revisión

- Código, pruebas, catálogos, documentación y configuración versionados.
- Nombres de archivos y metadatos de autoría y mensajes de los commits de publicación.
- Patrones de rutas personales, correos privados, tokens, claves privadas y direcciones IPv4.
- Las 32 fotografías JPEG de la entrega: sin coordenadas GPS en EXIF. Se conservan los créditos de sus fuentes libres.
- Ausencia de `.env` real, bases SQLite, registros, conversaciones, carpetas de herramientas y archivos de configuración privados en el paquete.

Los correos de las pruebas usan `example.invalid` y las IP de ejemplo usan rangos reservados
para documentación. `127.0.0.1` y `0.0.0.0` son direcciones técnicas de escucha y proxy;
no son la IP privada o pública de una persona. La cuenta pública de GitHub y su correo
`users.noreply.github.com` identifican la publicación sin exponer correo personal.

## Historial de publicación

La raíz saneada vigente de publicación es
`d205b6df01b4aab0414aa48b47dcb6ffedc7c8a1`. La actualización local continúa esa raíz,
con autoría pública y mensaje revisado, sin copiar el historial de desarrollo ni generar
otra raíz. Las instalaciones que ya usan ese historial podrán actualizar con `git pull --ff-only`
cuando se publique el nuevo commit aprobado.

Una instalación anterior al saneamiento puede necesitar un clon nuevo conservando los datos;
ver [ENTREGA.md](ENTREGA.md#una-vez-pasar-desde-la-primera-publicación-a-la-entrega-saneada).
La revisión se refiere a ramas y etiquetas vigentes; no retira copias descargadas por
terceros ni garantiza la eliminación inmediata de objetos antiguos en cachés del proveedor.

## Secretos y datos del evento

Las claves reales se configuran en `.env` en el servidor, se entregan por un canal separado
y no se versionan. El secreto de sesiones se genera en `data/session-secret` si no se fija
por entorno; la base del evento vive en `data/`. Estos archivos quedan fuera del paquete,
de GitHub y del contexto de construcción de la imagen. `.env.example` contiene únicamente
marcadores de configuración, que deben reemplazarse antes de iniciar producción.

El documento interno de traspaso se excluye de la entrega. Se exportan los archivos
versionados de la versión actual, nunca la carpeta `.git` de desarrollo ni el directorio
completo de trabajo. La prueba automática de claves numéricas se reparó y tiene muestras
ficticias; es una alarma limitada, no un detector universal de secretos.

La aplicación utiliza IP de participantes para los límites anti-spam durante el evento.
Eso es un dato de operación, no un archivo del repositorio. Tras el evento, aplicar la
anonimización de [DESPLIEGUE.md](DESPLIEGUE.md#10-después-del-evento-qué-hacer-con-los-datos).

La revisión por patrones complementa la lectura manual y no garantiza ausencia absoluta
de cualquier secreto o dato que pueda agregarse en futuras versiones. Repetirla antes de
publicar y evitar subir `data/`, `.env` o carpetas locales. La revisión adicional del servidor
y sus accesos corresponde a la Célula de Infraestructura y Seguridad.
