/** Una carga rechazada o sin difusión no demuestra capacidad del servidor. */
export function cargaCompleta(
  lectores: number,
  pines: number,
  rechazos: number,
  entregas: number,
): boolean {
  const esperadas = lectores * pines;
  return esperadas > 0 && rechazos === 0 && entregas === esperadas;
}
