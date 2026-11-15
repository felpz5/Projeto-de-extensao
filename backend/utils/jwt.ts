import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import { AppError } from '@/utils/app-error';

/** Conteúdo do access token: usuário (sub) e estabelecimento ativo (tid). */
export interface AccessPayload {
  sub: string;
  tid: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ sub: payload.sub, tid: payload.tid }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.tid !== 'string'
    ) {
      throw new Error('payload inválido');
    }
    return { sub: payload.sub, tid: payload.tid };
  } catch {
    throw new AppError('Token inválido ou expirado', 401);
  }
}
