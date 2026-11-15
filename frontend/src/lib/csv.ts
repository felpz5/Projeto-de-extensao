/**
 * Exportação CSV pensada para o Excel em português: separador ";" (o Excel pt-BR usa vírgula
 * como decimal), BOM UTF-8 (acentos certos) e números com vírgula decimal.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const text = typeof v === 'number' ? String(v).replace('.', ',') : v;
  // Aspas se tiver separador, aspas ou quebra de linha. Fórmulas (=, +, -, @) viram texto
  // para o Excel não executar nada vindo dos dados (CSV injection).
  const safe = /^[=+\-@]/.test(text) && typeof v !== 'number' ? `'${text}` : text;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(';')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(';'));
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Número da API (texto decimal) para a planilha. */
export const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? null : Number(v);
