# Verificación de la entrega

Fecha: 7 de octubre de 2026. Esta revisión comprueba las correcciones locales derivadas
del Manual de Trabajo 1.0: puerto configurable, instrucciones de instalación en GIIA,
detector de credenciales numéricas y dependencias de construcción. La comprobación usa
datos y credenciales ficticios en un contenedor separado del evento.

| Comprobación                            | Resultado                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                              | 355 pruebas en 26 archivos, salida 0                                                                                                                                      |
| `npm run typecheck`                     | Cliente, servidor y tipos compartidos: salida 0                                                                                                                           |
| `npm run lint`                          | Salida 0                                                                                                                                                                  |
| `npm run build`                         | Cliente y servidor construidos, salida 0                                                                                                                                  |
| Prettier                                | Aplicado y comprobado sobre los archivos modificados que tienen formato compatible                                                                                        |
| `git diff --check`                      | Sin errores de espacios                                                                                                                                                   |
| `npm audit --json`                      | Cero vulnerabilidades conocidas en el árbol completo                                                                                                                      |
| `npm audit --omit=dev --json` en Docker | Cero vulnerabilidades conocidas en dependencias de ejecución                                                                                                              |
| `npm run verificar:despliegue`          | Cuatro comprobaciones: puerto por defecto, puerto alternativo, valor vacío y rechazo de un puerto fuera de rango; salida 0                                                |
| Regresiones                             | Detector y puerto probados con defecto restaurado y corregido dos veces; el defecto provoca el fallo esperado                                                             |
| Construcción Docker                     | Instalación desde el lockfile en Linux, cliente y servidor compilados e imagen exportada; salida 0                                                                        |
| Compose                                 | Contenedor `healthy`; puerto real `127.0.0.1:3189` elegido por `.env`, sin sobrescribir `ports` en la configuración de prueba                                             |
| HTTP y WebSocket                        | Once comprobaciones correctas de salud, página, cabeceras, acceso protegido, login, control de sección, sesión, comunicación entre dos clientes, moderación y exportación |
| Usuario del contenedor                  | `node`, sin ejecutar la aplicación como root                                                                                                                              |
| Respaldo y restauración                 | SQLite en versión 5, `integrity_check=ok`, copia en caliente restaurada y contenido conservado                                                                            |
| Reinicio                                | Conserva datos y secreto persistente; permisos del secreto `600`                                                                                                          |
| Navegador                               | Mapa y pizarra renderizados; navegación y lectura de la nota de prueba después del reinicio; sin errores ni advertencias de consola después de recargar                   |

Imagen verificada: `pizarra-udec:requisitos-giia-20261007`.
Identificador: `sha256:c53f13ca224a38ab8a4aeb00675b2b89601d09eeed6e5b8a3034934ca1514aa6`.
Tamaño reportado por Docker: 431255189 bytes. Motor Docker 29.8.0 y Compose 5.5.1.
La medición puntual después de las comprobaciones fue de aproximadamente 48 MiB de RAM;
no se repitió el ensayo histórico de 600 asistentes y no se usa esta medida como garantía de capacidad.

La configuración de prueba reemplaza únicamente nombre, imagen, credenciales y volumen
de datos. El puerto 3189 procede de `PUERTO_PUBLICADO` en un archivo de entorno ficticio;
la configuración Compose del proyecto conserva el puerto interno 3000 y la escucha en
loopback. No se abrió el backend a otras máquinas ni se utilizaron datos del evento.

## Alcance y límites

- Prettier no admite archivos `.env`; ese ejemplo se revisó junto con la configuración Compose. El lockfile lo genera npm y se excluye del formateo por la configuración del proyecto.
- Vite mantiene el aviso de paquetes mayores de 500 KB. La capa de ciudad se carga aparte; no se cambió la arquitectura del mapa.
- La auditoría npm indica vulnerabilidades conocidas de sus paquetes a la fecha de revisión; no certifica la imagen base, el sistema operativo, el proxy ni futuras versiones. Ver [SEGURIDAD.md](SEGURIDAD.md).
- Se comprobó el navegador en escritorio contra HTTP local. El proxy real, HTTPS, DNS, certificado y acceso público requieren el servidor y dominio asignados por GIIA.
- La copia de entrega continúa el historial saneado existente y excluye el historial de desarrollo. Esta actualización queda preparada localmente; no se ha enviado a GitHub. Ver [PRIVACIDAD.md](PRIVACIDAD.md).
- La imagen de prueba queda disponible localmente. El paquete de entrega contiene fuentes para construirla; no incluye el archivo de imagen Docker, datos ni credenciales del evento.

**Pendientes de GIIA:** ticket y aprobaciones, recursos y puerto asignados, acceso autorizado,
instalación en `/var/src`, dominio, DNS, HTTPS y proxy, revisión de seguridad, actualizaciones,
monitoreo externo, rotación de logs por antigüedad y respaldos mensuales 3-2-1. El detalle
para remitir a la Célula está al final de [ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
