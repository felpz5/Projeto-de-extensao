// Prepara o banco antes da API subir (usado no Render, que não tem o serviço "migrate" do Docker):
//   1. aplica as migrations pendentes (como dono do banco: DIRECT_URL)
//   2. cria/atualiza o usuário gestock_app (sem BYPASSRLS) com a senha APP_DB_PASSWORD
// Idempotente: roda a cada deploy/reinício sem estragar nada.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = join(here, 'schema.prisma');
const password = process.env.APP_DB_PASSWORD ?? '';
const directUrl = process.env.DIRECT_URL ?? '';

if (!directUrl) throw new Error('Defina DIRECT_URL (usuário dono do banco, ex.: neondb_owner).');
// Só letras, números e hífen: a senha entra num comando SQL.
if (!/^[A-Za-z0-9-]{16,}$/.test(password)) {
  throw new Error('APP_DB_PASSWORD precisa ter 16+ caracteres, só letras, números e hífen.');
}
if (!(process.env.DATABASE_URL ?? '').includes(`:${password}@`)) {
  console.warn('AVISO: a senha da DATABASE_URL não é a APP_DB_PASSWORD (a API não vai conseguir entrar).');
}

function prisma(args, input) {
  try {
    execFileSync('npx', ['prisma', ...args], {
      stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      input,
    });
  } catch {
    // A mensagem padrão repetiria o comando, com a DIRECT_URL (e a senha do dono) no log.
    console.error(`Falhou: prisma ${args[0]} ${args[1]} (detalhes acima).`);
    process.exit(1);
  }
}

prisma(['migrate', 'deploy', '--schema', schema]);
const sql = readFileSync(join(here, 'sql', 'app-role.sql'), 'utf8').replaceAll('TROQUE-ESTA-SENHA', password);
// --url (não --schema): o schema usaria a DATABASE_URL, que é o próprio gestock_app.
prisma(['db', 'execute', '--stdin', '--url', directUrl], sql);
console.log('Banco pronto.');
