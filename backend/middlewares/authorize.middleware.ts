import type { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@/utils/app-error';

/** Restringe a rota aos papéis informados (no estabelecimento ativo). Use depois do `authenticate`. */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Autenticação necessária', 401));
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return next(new AppError('Seu perfil não tem permissão para esta ação', 403));
    }
    next();
  };
}

/** Papéis que administram catálogo, estoque, relatórios e previsão. */
export const MANAGERS: Role[] = ['OWNER', 'MANAGER'];
