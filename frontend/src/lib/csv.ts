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

// ---------- Leitura (importação de histórico) ----------

export interface ParsedCsv {
  delimiter: string;
  headers: string[];
  rows: string[][];
  /** Linha do arquivo (1 = primeira) onde começa cada registro de `rows` — para apontar erros. */
  lines: number[];
}

/** Separador mais provável (";" do Excel pt-BR, "," ou tabulação), olhando a 1ª linha. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (d: string) => {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    return n;
  };
  return [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
}

/**
 * CSV → cabeçalho + linhas (RFC 4180: aspas, aspas duplicadas, quebra de linha dentro de
 * aspas). Linhas vazias são ignoradas. Os valores ficam como TEXTO: a conversão e a validação
 * são do servidor.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const out: string[][] = [];
  const starts: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1; // linha física atual do arquivo
  let rowStart = 1; // linha onde o registro atual começou
  const endRow = () => {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) {
      out.push(row);
      starts.push(rowStart);
    }
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStart = line;
    } else field += ch;
  }
  endRow();
  const [headers = [], ...rows] = out;
  return { delimiter, headers: headers.map((h) => h.trim()), rows, lines: starts.slice(1) };
}

/** Lê o arquivo como UTF-8; se não for UTF-8 válido (Excel antigo), tenta Windows-1252. */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
