import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('detecta ";" (Excel pt-BR) e mantém vírgula decimal como texto', () => {
    const r = parseCsv('data;valor\n01/11/2026;25,50\n02/11/2026;10\n');
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual(['data', 'valor']);
    expect(r.rows).toEqual([
      ['01/11/2026', '25,50'],
      ['02/11/2026', '10'],
    ]);
  });

  it('aspas, aspas duplicadas e quebra de linha dentro de aspas', () => {
    const r = parseCsv('produto,obs\n"Açaí, 500 ml","disse ""oi""\nna fila"\r\n');
    expect(r.delimiter).toBe(',');
    expect(r.rows[0]).toEqual(['Açaí, 500 ml', 'disse "oi"\nna fila']);
  });

  it('guarda a linha real de cada registro (linhas vazias e quebra dentro de aspas)', () => {
    const r = parseCsv('a;b\n\n1;2\n"x\ny";3\n\n4;5\n');
    expect(r.rows).toEqual([
      ['1', '2'],
      ['x\ny', '3'],
      ['4', '5'],
    ]);
    expect(r.lines).toEqual([3, 4, 7]);
  });

  it('ignora BOM e linhas vazias', () => {
    const r = parseCsv('﻿a;b\n\n1;2\n;\n');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([['1', '2']]);
  });

  it('lê de volta o que o próprio Gestock exporta', () => {
    const csv = toCsv([{ d: '2026-11-01', v: 12.5 }], [
      { header: 'Data', value: (x) => x.d },
      { header: 'Valor', value: (x) => x.v },
    ]);
    expect(parseCsv(csv).rows).toEqual([['2026-11-01', '12,5']]);
  });
});
