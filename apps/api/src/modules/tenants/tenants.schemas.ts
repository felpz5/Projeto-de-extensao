import { z } from 'zod';
import { timezone } from '../../common/schemas';
import { email, password } from '../auth/auth.schemas';

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    segment: z.string().trim().max(60).nullable().optional(),
    timezone: timezone.optional(),
  })
  .strict();
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

const assignableRole = z.enum(['MANAGER', 'STAFF']);

/**
 * Adiciona um membro. Se o e-mail já tem conta, só cria o vínculo.
 * Se não tem, cria a conta com nome e senha provisória (o funcionário deve trocá-la depois).
 */
export const addMemberSchema = z
  .object({
    email,
    role: assignableRole,
    name: z.string().trim().min(2).max(120).optional(),
    password: password.optional(),
  })
  .strict();
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z
  .object({
    role: assignableRole.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
