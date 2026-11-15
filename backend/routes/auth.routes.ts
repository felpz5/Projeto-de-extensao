import { Router } from 'express';
import { authController } from '@/controllers/auth.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import {
  changePasswordLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
} from '@/middlewares/rate-limit.middleware';

export const authRoutes = Router();

// Públicas (com limite de tentativas)
authRoutes.post('/register', registerLimiter, authController.register);
authRoutes.post('/login', loginLimiter, authController.login);
authRoutes.post('/refresh', refreshLimiter, authController.refresh);
authRoutes.post('/logout', authController.logout);

// Logado
authRoutes.post('/switch-tenant', authenticate, authController.switchTenant);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post(
  '/change-password',
  authenticate,
  changePasswordLimiter,
  authController.changePassword,
);

// Convites para entrar em outro estabelecimento
authRoutes.get('/invitations', authenticate, authController.listInvitations);
authRoutes.post('/invitations/:tenantId/accept', authenticate, authController.acceptInvitation);
authRoutes.delete('/invitations/:tenantId', authenticate, authController.declineInvitation);
