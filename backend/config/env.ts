import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  // Banco: DATABASE_URL = usuário da API (sem BYPASSRLS); DIRECT_URL = dono das tabelas (migrations).
  DATABASE_URL: z.string().url('DATABASE_URL precisa ser uma URL do PostgreSQL'),
  // Obrigatória porque o schema.prisma usa `directUrl`. Em desenvolvimento pode ser igual à DATABASE_URL.
  DIRECT_URL: z.string().url('DIRECT_URL precisa ser uma URL do PostgreSQL'),

  // JWT (access token curto) + refresh token opaco em cookie httpOnly
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa ter pelo menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Front-end autorizado (separe vários por vírgula)
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // strict (padrão do planejamento) | lax | none (front e API em sites diferentes, exige HTTPS)
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('strict'),

  // Proxies na frente da API (Render/Railway = 1); 0 = acesso direto.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variáveis de ambiente inválidas:\n${problems.join('\n')}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
