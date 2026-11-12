import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AuthContext } from './auth-context';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

export interface AccessPayload {
  sub: string;
  tid: string;
}

/**
 * Guard global:
 * 1. valida o access token (JWT);
 * 2. confere no banco que o usuário ainda é membro ATIVO do estabelecimento (papel sempre atualizado);
 * 3. aplica @Roles(...) quando presente.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Autenticação necessária');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const membership = await this.db.withContext(
      { tenantId: payload.tid, userId: payload.sub },
      (tx) =>
        tx.membership.findUnique({
          where: { tenantId_userId: { tenantId: payload.tid, userId: payload.sub } },
          select: { role: true, status: true },
        }),
    );
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Sem acesso a este estabelecimento');
    }

    req.auth = { userId: payload.sub, tenantId: payload.tid, role: membership.role };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(membership.role)) {
      throw new ForbiddenException('Seu perfil não tem permissão para esta ação');
    }
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
