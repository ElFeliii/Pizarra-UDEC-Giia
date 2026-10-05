# Revisión del repositorio de entrega

Revisión del 5 de octubre de 2026, aplicada a los archivos de entrega, el ZIP y el historial
vigente de la copia publicada. El repositorio de desarrollo permanece separado y no se
transfiere a GitHub: sus revisiones antiguas no forman parte de la entrega.

## Alcance de la revisión

- Archivos de código, pruebas, catálogos, documentación y configuración versionados.
- Nombres de archivos y metadatos de autoría y mensajes de los commits que se publican.
- Patrones de rutas personales, correos privados, tokens, claves privadas y direcciones IP.
- Las 26 fotografías JPEG: sin coordenadas GPS en EXIF. Se conservan los créditos de sus fuentes libres.
- Ausencia de `.env`, bases SQLite, registros, conversaciones, carpetas de herramientas y archivos de configuración privados en el paquete.

Los correos de las pruebas usan `example.invalid` y las IP de ejemplo usan `192.0.2.0/24`,
un rango reservado para documentación. `127.0.0.1` y `0.0.0.0` son direcciones técnicas de
escucha y proxy; no son la IP privada o pública de una persona. La cuenta pública de GitHub
y su correo `users.noreply.github.com` identifican la publicación sin exponer correo personal.

## Saneamiento de la publicación

El mensaje del único commit de la publicación original contenía una firma de herramienta.
La entrega saneada usa una nueva raíz con mensaje y autoría revisados, sin copiar el
historial de desarrollo. Las futuras actualizaciones conservan este historial limpio.
Las instalaciones anteriores deben pasar una vez a un clon nuevo conservando los datos;
ver [ENTREGA.md](ENTREGA.md#una-vez-pasar-desde-la-primera-publicación-a-la-entrega-saneada).

La revisión del historial se refiere a las ramas y etiquetas vigentes. Una sustitución de
historial no puede retirar copias que terceros hayan descargado ni garantiza que el
proveedor elimine inmediatamente objetos antiguos de sus cachés.

## Secretos y datos del evento

Las claves reales se configuran en `.env` en el servidor, se entregan por un canal separado
y no se versionan. El secreto de sesiones se genera en `data/session-secret` si no se fija
por entorno; la base de datos del evento vive en `data/`. Estos archivos quedan fuera de
GitHub, el ZIP y la construcción de la imagen.

La aplicación necesita la IP de quienes participan para los límites anti-spam durante el
evento. Eso es un dato de operación, no un archivo del repositorio. Tras el evento, ejecutar
la anonimización indicada en [DESPLIEGUE.md](DESPLIEGUE.md#10-después-del-evento-qué-hacer-con-los-datos).

La revisión por patrones complementa la lectura manual; no equivale a una garantía absoluta
contra cualquier secreto o dato que pueda agregarse en futuras versiones. Repetirla antes
de publicar y evitar subir `data/`, `.env` o carpetas locales.
