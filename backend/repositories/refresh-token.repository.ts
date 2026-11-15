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

  /**
   * Apaga sessões que não servem mais: vencidas há mais de 1 dia ou revogadas há mais de 30
   * (a janela de 30 dias mantém a detecção de reuso de token roubado). Sem isso a tabela
   * cresceria para sempre (uma linha a cada renovação, ~a cada 15 min de uso).
   */
  async purgeStale(): Promise<number> {
    const day = 24 * 60 * 60_000;
    const { count } = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - day) } },
          { revokedAt: { lt: new Date(Date.now() - 30 * day) } },
        ],
      },
    });
    return count;
  }

  revokeAllForUser(userId: string, reason: RevokeReason) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
