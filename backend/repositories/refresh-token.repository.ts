import type { Prisma, RevokeReason } from '@prisma/client';
import { prisma } from '@/config/database';

/** Refresh tokens (só o hash é guardado). Tabela global, sem RLS. */
export class RefreshTokenRepository {
  findByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  create(data: Prisma.RefreshTokenUncheckedCreateInput) {
    return prisma.refreshToken.create({ data });
  }

  /** Rotação: revoga só se ainda estiver ativo. Devolve false se outra requisição revogou antes. */
  async rotate(id: string): Promise<boolean> {
    const { count } = await prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
    });
    return count === 1;
  }

  revokeByHash(tokenHash: string, reason: RevokeReason = 'LOGOUT') {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  revokeAllForUser(userId: string, reason: RevokeReason) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
