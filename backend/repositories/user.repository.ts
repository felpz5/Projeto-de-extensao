import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/config/database';

/** `users` é global (sem RLS): só os módulos de autenticação e equipe acessam. */
export class UserRepository {
  findByEmail(email: string, db: Tx = prisma) {
    return db.user.findUnique({ where: { email } });
  }

  findPublicById(id: string, db: Tx = prisma) {
    return db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, mustChangePassword: true },
    });
  }

  findById(id: string, db: Tx = prisma) {
    return db.user.findUniqueOrThrow({ where: { id } });
  }

  findProfile(id: string, db: Tx = prisma) {
    return db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, mustChangePassword: true, createdAt: true },
    });
  }

  create(data: Prisma.UserUncheckedCreateInput, db: Tx = prisma) {
    return db.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput, db: Tx = prisma) {
    return db.user.update({ where: { id }, data });
  }

  /** Nomes para exibir em listas (quem vendeu, quem cancelou, quem fez a ação). */
  async namesById(ids: (string | null | undefined)[], db: Tx = prisma) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map<string, string>();
    const rows = await db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

export const userRepository = new UserRepository();
