#!/usr/bin/env node
/**
 * Relatório de precisão da previsão (backtesting) de um estabelecimento, em Markdown.
 * Usa a própria API (mesmas regras, mesmo isolamento por loja): nada é calculado à parte.
 *
 *   GESTOCK_EMAIL=dono@loja.com GESTOCK_PASSWORD=... \
 *     node scripts/relatorio-precisao.mjs http://localhost:3333/api [dias-de-histórico] > relatorio.md
 *
 * A senha vem só de variável de ambiente (não fica no histórico do terminal nem no arquivo).
 * O relatório diz se os dados são de DEMONSTRAÇÃO (simulados) ou registrados/importados.
 */
const [, , base = 'http://localhost:3333/api', lookback = '120'] = process.argv;
const email = process.env.GESTOCK_EMAIL;
const password = process.env.GESTOCK_PASSWORD;
if (!email || !password) {
  console.error('Defina GESTOCK_EMAIL e GESTOCK_PASSWORD (conta de dono ou gerente).');
  process.exit(1);
}

const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(`Login falhou (${login.status}).`);
  process.exit(1);
}
const { accessToken, tenant } = await login.json();
const res = await fetch(`${base}/forecast/accuracy?lookbackDays=${lookback}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!res.ok) {
  console.error(`Relatório falhou (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const r = await res.json();

const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const label = Object.fromEntries(r.models.map((m) => [m.id, m.label]));
const source = {
  DEMO: 'DEMONSTRAÇÃO — dados SIMULADOS (não são resultados do parceiro)',
  REGISTERED: 'registrados no sistema',
  REGISTERED_AND_IMPORTED: `registrados no sistema e importados (${pct(r.importedShare)} dos pedidos importados)`,
}[r.dataSource];

const out = [];
out.push(`# Precisão da previsão — ${tenant.name}`);
out.push('');
out.push(`- Gerado em: ${new Date().toISOString().slice(0, 10)} (previsões para a partir de ${r.generatedFor})`);
out.push(`- Origem dos dados: **${source}**`);
out.push(`- Histórico analisado: últimos ${r.lookbackDays} dias`);
out.push(
  '- Método: backtesting com janela crescente (origens a cada 7 dias, treino mínimo de 28 dias); ' +
    'cada previsão usa só os dados anteriores à data simulada.',
);
out.push('- Métricas por dia previsto: MAE e RMSE na unidade da série; WAPE = Σ|erro| ÷ Σ|real|.');
out.push('');

for (const g of r.groups) {
  out.push(`## ${g.label} (${g.unit})`);
  out.push('');
  out.push(`Séries: ${g.series} · com avaliação: ${g.evaluatedSeries}`);
  out.push('');
  for (const h of g.byHorizon) {
    const rows = h.models.filter((m) => m.metrics.n > 0);
    if (!rows.length) {
      out.push(`**Horizonte ${h.horizon} dias:** histórico insuficiente para avaliar.`);
      out.push('');
      continue;
    }
    out.push(`**Horizonte ${h.horizon} dias**`);
    out.push('');
    out.push('| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |');
    out.push('|---|---:|---:|---:|---:|---:|---:|');
    const best = Math.min(...rows.map((m) => m.metrics.mae));
    for (const m of rows) {
      const name = m.metrics.mae === best ? `**${label[m.model]}**` : label[m.model];
      out.push(
        `| ${name} | ${m.metrics.n} | ${m.origins} | ${num(m.metrics.mae)} | ${num(m.metrics.rmse)} | ${pct(m.metrics.wape)} | ${num(m.metrics.bias)} |`,
      );
    }
    out.push('');
  }
  if (g.best.length > 1) {
    const fmt = (e) => `${e.name} (${pct(e.accuracy.gestock.wape)})`;
    out.push(`Menor erro do Gestock (7 dias): ${g.best.map(fmt).join(', ')}`);
    out.push(`Maior erro do Gestock (7 dias): ${g.worst.map(fmt).join(', ')}`);
    out.push('');
  }
}
out.push('> Em negrito, o modelo com menor MAE em cada horizonte. Resultados com poucas origens são preliminares.');
console.log(out.join('\n'));
