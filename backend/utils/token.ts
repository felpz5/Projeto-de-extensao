import { createHash, randomBytes } from 'node:crypto';

/** Token opaco e aleatório (usado como refresh token). */
export const generateOpaqueToken = () => randomBytes(48).toString('base64url');

/** Só o hash do token vai para o banco. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
