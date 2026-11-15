import { z } from 'zod';
import { email, password } from '@/validations/auth.validation';
import { timezone } from '@/validations/common.validation';

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    segment: z.string().trim().max(60).nullable().optional(),
    timezone: timezone.optional(),
  })
  .strict();

const assignableRole = z.enum(['MANAGER', 'STAFF']);

/**
 * Adiciona um membro. Se o e-mail já tem conta, só cria o vínculo.
 * Se não tem, cria a conta com nome e senha provisória.
 */
export const addMemberSchema = z
  .object({
    email,
    role: assignableRole,
    name: z.string().trim().min(2).max(120).optional(),
    password: password.optional(),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    role: assignableRole.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();

/** Nova senha provisória para um membro (ele troca no próximo acesso). */
export const resetMemberPasswordSchema = z.object({ password }).strict();

export const auditQuery = z
  .object({
    entity: z.string().trim().max(40).optional(),
    userId: z.string().uuid().optional(),
    take: z.coerce.number().int().min(1).max(100).default(30),
    skip: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
