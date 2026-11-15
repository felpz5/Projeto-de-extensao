import { z } from 'zod';
import { timezone, uuid } from '@/validations/common.validation';

export const email = z.string().trim().toLowerCase().email('E-mail inválido').max(254);

export const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    password,
    establishmentName: z.string().trim().min(2).max(120),
    segment: z.string().trim().max(60).optional(),
    timezone: timezone.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    tenantId: uuid.optional(),
  })
  .strict();

export const switchTenantSchema = z.object({ tenantId: uuid }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict()
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['newPassword'],
  });

/** Editar o próprio perfil. Trocar o e-mail (que é o login) exige a senha atual. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: email.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.email !== undefined, 'Nada para alterar')
  .refine((d) => d.email === undefined || d.currentPassword, {
    message: 'Informe a senha atual para trocar o e-mail',
    path: ['currentPassword'],
  });

/** Visão das minhas lojas (dono/gerente de mais de um estabelecimento). */
export const storesOverviewQuery = z
  .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
  .strict();
