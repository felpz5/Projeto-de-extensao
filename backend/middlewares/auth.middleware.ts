import type { NextFunction, Request, Response } from 'express';
import { withContext } from '@/config/database';
import { membershipRepository } from '@/repositories/membership.repository';
import { AppError } from '@/utils/app-error';
import { verifyAccessToken } from '@/utils/jwt';

/**
 * 1. valida o access token (JWT);
 * 2. confere no banco que o usuário ainda é membro ATIVO do estabelecimento
 *    (o papel vem sempre atualizado: desativar um funcionário corta o acesso na hora);
 * 3. preenche `req.user`.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  if (type !== 'Bearer' || !token) throw new AppError('Autenticação necessária', 401);

  const payload = verifyAccessToken(token);

  const membership = await withContext({ tenantId: payload.tid, userId: payload.sub }, (tx) =>
    membershipRepository.findOne(tx, payload.tid, payload.sub),
  );
  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('Sem acesso a este estabelecimento', 403);
  }

  req.user = { userId: payload.sub, tenantId: payload.tid, role: membership.role };
  next();
}
