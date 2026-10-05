# Lista de colegios y universidades

Es lo que el asistente elige al entrar. Vive en
[server/data/instituciones.json](../server/data/instituciones.json) y se puede editar a mano,
pero conviene regenerarla desde la fuente oficial.

Estado actual: **533 instituciones** — 12 universidades y 521 colegios de la **provincia de
Concepción** (datos de 2025).

| Comuna | Colegios | | Comuna | Colegios |
|---|---|---|---|---|
| Concepción | 110 | | Lota | 25 |
| Coronel | 73 | | Penco | 25 |
| Talcahuano | 65 | | Hualqui | 22 |
| San Pedro de la Paz | 56 | | Santa Juana | 16 |
| Tomé | 41 | | Florida | 15 |
| Chiguayante | 38 | | | |
| Hualpén | 35 | | | |

## Colegios: cómo se generan

Fuente: **Directorio Oficial de Establecimientos Educacionales** del MINEDUC
(<https://datosabiertos.mineduc.cl/directorio-de-establecimientos-educacionales/>).

1. Descargar el archivo del año más reciente (viene en `.rar`) y extraer el CSV.
2. Generar la lista:

   ```bash
   npx tsx scripts/instituciones/build.ts "ruta/al/Directorio_Oficial_EE_2025.csv"
   ```

Criterios que aplica el script:

- Región del Biobío (código 8) y **provincia de Concepción** (código 81): Concepción,
  Talcahuano, Hualpén, San Pedro de la Paz, Chiguayante, Penco, Tomé, Coronel, Lota, Hualqui,
  Florida y Santa Juana.
- Solo establecimientos **en funcionamiento** (`ESTADO_ESTAB = 1`).
- Solo los que imparten **algo más que educación parvularia** (básica, media, especial o
  adultos). Un jardín infantil sin básica no aparece.
- Los nombres vienen en MAYÚSCULAS y se pasan a capitalización normal.
- Se agrega la **comuna**: hay colegios que se llaman igual en distintas comunas, y el buscador
  del selector también busca por comuna ("coronel" lista los de Coronel).

Para otra zona, se cambian las variables de entorno:

```bash
REGION=8 PROVINCIA=83 npx tsx scripts/instituciones/build.ts "…/Directorio.csv"   # provincia de Biobío (Los Ángeles)
```

## Universidades

Se mantienen a mano en
[scripts/instituciones/universidades.json](../scripts/instituciones/universidades.json) porque
son pocas y cambian poco. Las 12 actuales son las que tienen sede en la región según la **base
de matrícula en educación superior 2025 del SIES**
(<https://datosabiertos.mineduc.cl/matricula-en-educacion-superior/>):

| Universidad | Sedes en la región |
|---|---|
| Universidad de Concepción | Concepción, Los Ángeles |
| Universidad San Sebastián | Concepción |
| Universidad Católica de la Santísima Concepción | Concepción, Talcahuano, Los Ángeles, Cañete |
| Universidad Andrés Bello | Concepción |
| Universidad del Bío-Bío | Concepción |
| Universidad del Desarrollo | Concepción |
| Universidad de Las Américas | Concepción |
| Universidad Técnica Federico Santa María | Hualpén |
| Universidad Santo Tomás | Concepción, Los Ángeles |
| Universidad Tecnológica de Chile INACAP | Talcahuano, Los Ángeles |
| Universidad La República | Concepción, Los Ángeles |
| Universidad Bolivariana | Concepción, Los Ángeles |

No se incluyeron **institutos profesionales ni centros de formación técnica** (Duoc UC, AIEP,
Santo Tomás IP, INACAP IP, etc.). Si los asistentes vienen de ahí, se agregan a ese mismo
archivo con `"type": "universidad"`, o usan la opción "Otra".

## Notas

- El archivo se monta en el contenedor: al editarlo basta `docker compose restart`.
- Los `id` tienen que ser únicos, en minúsculas, con números y guiones. `otra` está reservado.
- La lista incluye escuelas especiales y centros de educación de adultos, que también son
  establecimientos con estudiantes. Si prefieres dejar solo básica y media, se ajusta el filtro
  en `scripts/instituciones/build.ts`.
