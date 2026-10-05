# Catálogo de carreras y temas

Fuente consultada el 4 de octubre de 2026, aceptada por el equipo para la Parte 5:

- [Catálogo de Admisión UdeC](https://admision.udec.cl/carreras-udec/): nombres y campus.
- [Puertas Abiertas UdeC](https://admision.udec.cl/puertas-abiertas/): facultad o escuela de cada carrera.
- [Directorio institucional](https://www.udec.cl/facultades/): contraste de unidades académicas.

La transcripción versionada está en `scripts/carreras/catalogo.json`; `npm run carreras`
regenera `server/data/carreras.json` sin consultar servicios externos al arrancar.
Son 92 ofertas por campus: 74 Concepción, 7 Chillán y 11 Los Ángeles. La portada anuncia 91;
se conserva la lista explícita aprobada, sin eliminar una carrera para forzar esa cifra.
No se afirma que la lista sea la oferta definitiva de admisión 2027.

Cada oferta recibe un identificador estable por nombre y campus. `grupo` conserva el nombre
oficial de la facultad o escuela; no introduce una clasificación por áreas inventada.
Ingeniería Ambiental de Concepción y Chillán, por ejemplo, tiene unidades distintas.
Ingeniería Civil Matemática pertenece a Ciencias Físicas y Matemáticas; Bioquímica y
Nutrición y Dietética pertenecen a Farmacia. El Bachillerato en Ciencias e Innovación está
adscrito a Ciencias Químicas según su [ficha de Admisión](https://admision.udec.cl/bachillerato-en-ciencias-e-innovacion/).

## Actualización y preguntas frecuentes

Para incorporar nuevas carreras, revisar la fuente oficial, actualizar la transcripción,
subir `version` y ejecutar `npm run carreras`. La semilla agrega lo nuevo sin sobrescribir
temas existentes ni lo que haya ocultado el moderador. No renombrar identificadores ya usados.

`server/data/faq.json` arranca con `temas: []` por decisión del equipo. Las preguntas se
agregan desde `/moderador` → Secciones → Preguntas frecuentes. También pueden ocultarse
y volver a mostrarse sin borrar notas. No se incluyen preguntas ni respuestas inventadas.
Las respuestas de universitarios son notas del muro; sus comentarios usan los hilos existentes.

La migración v4 agrega `temas`, `pins.tema_id` y el campus del tema. Las notas anteriores
conservan su contenido y quedan con tema nulo. Publicar en Carreras o FAQ exige un tema
visible de esa misma sección. El cierre de sección se verifica siempre en el servidor.
