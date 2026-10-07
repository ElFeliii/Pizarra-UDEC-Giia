import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingCard } from './BuildingCard';
import { CampusLayer } from './CampusLayer';
import { BUILDING_INFO, campus } from './campus';

const estado = vi.hoisted(() => ({
  placing: null as object | null,
  openBuildingId: null as string | null,
  openBuilding: vi.fn(),
  closeBuilding: vi.fn(),
}));

vi.mock('../state/store', () => ({
  useStore: (selector: (valor: typeof estado) => unknown) => selector(estado),
}));

beforeEach(() => {
  estado.placing = null;
  estado.openBuildingId = null;
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});

afterEach(() => vi.unstubAllGlobals());

describe('selección de edificios en el mapa', () => {
  it('habilita las siluetas de todos los edificios identificados, aunque no tengan foto ni texto', () => {
    const marcado = renderToStaticMarkup(createElement(CampusLayer, { k: 2.2 }));
    const botones = marcado.match(/<path[^>]*role="button"/g) ?? [];
    expect(botones).toHaveLength(campus.buildings.length);
    expect(marcado).toContain('Ver información de Block 3 Plaza Perú');
    expect(marcado).toContain('Ver información de Facultad de Educación');
  });

  it('permite seleccionar también los nombres visibles', () => {
    const marcado = renderToStaticMarkup(createElement(CampusLayer, { k: 2.2 }));
    expect(marcado.match(/<text[^>]*role="button"/g)?.length).toBeGreaterThan(0);
  });

  it('deja pasar los clics al lienzo cuando se está colocando un pin', () => {
    estado.placing = {};
    const marcado = renderToStaticMarkup(createElement(CampusLayer, { k: 2.2 }));
    expect(marcado).not.toContain('role="button"');
    expect(marcado).not.toContain('mapa__rotulo--activo');
  });
});

describe('ficha del edificio', () => {
  it('abre un edificio sin contenido y señala lo que falta', () => {
    estado.openBuildingId = 'edificio-block-3-plaza-peru';
    const marcado = renderToStaticMarkup(createElement(BuildingCard));
    expect(marcado).toContain('Información de Block 3 Plaza Perú');
    expect(marcado).toContain('Foto pendiente');
    expect(marcado).toContain('Descripción pendiente.');
  });

  it('muestra el texto y el enlace oficial de una ficha nueva aunque falte la foto', () => {
    estado.openBuildingId = 'edificio-facultad-de-educacion';
    const marcado = renderToStaticMarkup(createElement(BuildingCard));
    expect(marcado).toContain(BUILDING_INFO[estado.openBuildingId]!.descripcion);
    expect(marcado).toContain('https://educacion.udec.cl/carreras/');
    expect(marcado).toContain('rel="noreferrer noopener"');
    expect(marcado).toContain('Foto pendiente');
  });

  it('conserva la fotografía y su crédito en las fichas existentes', () => {
    estado.openBuildingId = 'edificio-biblioteca-central-luis-david-cruz-ocampo';
    const marcado = renderToStaticMarkup(createElement(BuildingCard));
    expect(marcado).toContain('/edificios/biblioteca-central-luis-david-cruz-ocampo.jpg');
    expect(marcado).toContain('Tomás Jorquera');
    expect(marcado).toContain('CC BY 2.0');
  });
});
