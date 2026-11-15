import { randomBytes } from 'node:crypto';

/** "Açaí da Praça" → "acai-da-praca-3f9a1c" (sufixo aleatório evita colisão). */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${base || 'loja'}-${randomBytes(3).toString('hex')}`;
}
