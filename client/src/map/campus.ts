import raw from './campus.json';
import contenido from './edificios.json';

export type Kind = 'agua' | 'verde' | 'calle' | 'sendero' | 'edificio';

export interface MapFeature {
  k: Kind;
  d: string;
  id?: string;
  n?: string;
}

export interface Building {
  id: string;
  name: string;
  cx: number;
  cy: number;
  area: number;
}

export interface CampusMap {
  generated: string;
  center: [number, number];
  /** Ancho y alto del lienzo en metros. */
  world: [number, number];
  viewBox: [number, number, number, number];
  attribution: string;
  features: MapFeature[];
  buildings: Building[];
  minLabelArea: number;
}

/** Foto de un edificio, con el crédito que exige su licencia. */
export interface Foto {
  /** Archivo dentro de `client/public/edificios/`. */
  archivo: string;
  /** Quién la tomó. Vacío en las fotos propias del equipo. */
  autor?: string;
  /** Licencia tal como la declara la fuente (p. ej. "CC BY-SA 4.0"). */
  licencia?: string;
  /** Página de origen, para poder verificar la licencia. */
  fuente?: string;
}

/** Ficha de un edificio: la completa el equipo en `edificios.json`. */
export interface BuildingInfo {
  /** Texto para la ventana del edificio. Vacío mientras no lo entreguen. */
  descripcion: string;
  /** Fuente institucional o cartográfica que respalda el texto de la ficha. */
  fuenteDescripcion?: string;
  fotos: Foto[];
}

export const campus = raw as CampusMap;

export const BUILDINGS: Map<string, Building> = new Map(campus.buildings.map((b) => [b.id, b]));

/** Contenido disponible; la selección del mapa incluye todos los edificios identificados. */
export const BUILDING_INFO = contenido as Record<string, BuildingInfo>;

export function buildingInfo(id: string | null | undefined): BuildingInfo | undefined {
  return id ? BUILDING_INFO[id] : undefined;
}
