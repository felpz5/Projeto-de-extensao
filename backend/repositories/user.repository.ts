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
}

export const userRepository = new UserRepository();
