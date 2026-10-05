import { beforeEach, describe, expect, it } from 'vitest';
import type { PinSummary, Seccion, Tema } from '@pizarra/shared';
import { ordenarSecciones, useStore } from './store';

const pregunta: Tema = {
  id: 'faq-becas',
  nombre: '¿Cómo postulo a becas?',
  seccion: 'faq',
  grupo: null,
  campus: null,
  orden: 0,
  oculto: false,
};
const carrera: Tema = {
  ...pregunta,
  id: 'carrera-medicina',
  nombre: 'Medicina',
  seccion: 'carreras',
};
const nota: PinSummary = {
  id: 1,
  seccion: 'faq',
  temaId: pregunta.id,
  surface: 'board',
  x: 0,
  y: 0,
  color: 'verde',
  preview: 'Consulta los beneficios',
  authorId: 1,
  authorName: 'Estudiante',
  institutionName: 'Universidad de Concepción',
  createdAt: 1,
  updatedAt: 1,
  replyCount: 0,
  vistas: 0,
};
const secciones: Seccion[] = [
  { id: 'mapa', nombre: 'Mapa', tipo: 'lienzo', orden: 0, estado: 'abierta', updatedAt: 0 },
  {
    id: 'faq',
    nombre: 'Preguntas frecuentes',
    tipo: 'muro',
    orden: 1,
    estado: 'abierta',
    updatedAt: 0,
  },
  { id: 'carreras', nombre: 'Carreras', tipo: 'muro', orden: 2, estado: 'abierta', updatedAt: 0 },
];
beforeEach(() => useStore.setState(useStore.getInitialState(), true));
describe('temas y cambios de sección en tiempo real', () => {
  it('solo permite seleccionar un tema visible de la sección actual', () => {
    const estado = useStore.getState();
    estado.setTemas([pregunta, carrera]);
    estado.setSeccion('faq');
    estado.elegirTema(carrera.id);
    expect(useStore.getState().temaId).toBeNull();
    estado.elegirTema(pregunta.id);
    expect(useStore.getState().temaId).toBe(pregunta.id);
    estado.setSeccion('carreras');
    expect(useStore.getState().temaId).toBeNull();
  });
  it('ocultar una pregunta retira sus notas y cierra el hilo y el registro pendiente', () => {
    const estado = useStore.getState();
    estado.setSeccion('faq');
    estado.setTemas([pregunta]);
    estado.elegirTema(pregunta.id);
    estado.upsertPin(nota);
    estado.openPin(nota.id);
    estado.pedirRegistro('Para responder', () => {});
    estado.aplicarTema({ ...pregunta, oculto: true });
    const actual = useStore.getState();
    expect(actual.pins.size).toBe(0);
    expect(actual.openPinId).toBeNull();
    expect(actual.temaId).toBeNull();
    expect(actual.registro).toBeNull();
  });
  it('una reconexión retira notas de temas que se ocultaron estando desconectado', () => {
    const estado = useStore.getState();
    estado.upsertPin(nota);
    estado.openPin(nota.id);
    estado.setTemas([]);
    expect(useStore.getState().pins.size).toBe(0);
    expect(useStore.getState().openPinId).toBeNull();
  });
  it('una respuesta atrasada no restaura una pregunta oculta ni pisa contadores recientes', () => {
    const estado = useStore.getState();
    estado.setTemas([pregunta]);
    estado.upsertPin({ ...nota, replyCount: 2, updatedAt: 5 });
    estado.applySnapshot({ pins: [nota], removed: [], serverTime: 6 }, false);
    expect(useStore.getState().pins.get(nota.id)?.replyCount).toBe(2);
    estado.aplicarTema({ ...pregunta, oculto: true });
    estado.applySnapshot({ pins: [nota], removed: [], serverTime: 7 }, false);
    estado.upsertPin(nota);
    expect(useStore.getState().pins.size).toBe(0);
  });
  it('ocultar la sección activa navega a la siguiente disponible', () => {
    const estado = useStore.getState();
    estado.setSecciones(secciones);
    estado.setSeccion('faq');
    estado.upsertPin(nota);
    estado.applySeccion({ ...secciones[1]!, estado: 'oculta' });
    expect(useStore.getState().seccion).toBe('mapa');
    expect(useStore.getState().pins.size).toBe(0);
    expect(ordenarSecciones(useStore.getState().secciones).map((seccion) => seccion.id)).toEqual([
      'mapa',
      'carreras',
    ]);
  });
  it('al reconectar cambia de sección si la API ya no incluye la que se ocultó', () => {
    const estado = useStore.getState();
    estado.setSecciones(secciones);
    estado.setSeccion('faq');
    estado.setSecciones(secciones.filter((seccion) => seccion.id !== 'faq'));
    expect(useStore.getState().seccion).toBe('mapa');
  });
  it('si todas las secciones están ocultas retira el contenido de la pantalla', () => {
    const estado = useStore.getState();
    estado.setSeccion('faq');
    estado.upsertPin(nota);
    estado.setSecciones(secciones.map((seccion) => ({ ...seccion, estado: 'oculta' })));
    expect(useStore.getState().pins.size).toBe(0);
    expect(ordenarSecciones(useStore.getState().secciones)).toEqual([]);
  });
});
