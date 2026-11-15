import { Router } from 'express';
import { tenantController } from '@/controllers/tenant.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Dados do estabelecimento ativo e equipe. */
export const tenantRoutes = Router();

tenantRoutes.use(authenticate);

tenantRoutes.get('/', tenantController.show);
tenantRoutes.patch('/', authorize('OWNER'), tenantController.update);

/**
 * Equipe: dono gerencia todos; gerente gerencia só funcionários (regra no service).
 */
tenantRoutes.get('/members', authorize(...MANAGERS), tenantController.listMembers);
tenantRoutes.post('/members', authorize(...MANAGERS), tenantController.addMember);
tenantRoutes.patch('/members/:userId', authorize(...MANAGERS), tenantController.updateMember);
tenantRoutes.delete('/members/:userId', authorize(...MANAGERS), tenantController.removeMember);
tenantRoutes.post(
  '/members/:userId/password',
  authorize(...MANAGERS),
  tenantController.resetMemberPassword,
);

/** Auditoria do estabelecimento (dono e gerente). */
tenantRoutes.get('/audit', authorize(...MANAGERS), tenantController.audit);
