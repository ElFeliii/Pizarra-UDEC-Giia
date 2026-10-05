const dateFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatDate(ms: unknown): string {
  return typeof ms === 'number' ? dateFmt.format(ms) : '';
}

export interface CsvColumn {
  key: string;
  header: string;
  format?: (value: unknown) => string;
}

/** Separador ";" porque Excel en configuración regional de Chile lo usa para CSV. */
const SEP = ';';

function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Evita inyección de fórmulas al abrir en Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV UTF-8 con BOM para que Excel respete tildes y ñ. */
export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(SEP)];
  for (const row of rows) {
    lines.push(
      columns.map((c) => escapeCell(c.format ? c.format(row[c.key]) : row[c.key])).join(SEP),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
