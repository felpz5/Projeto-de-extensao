import { Router } from 'express';
import { tenantController } from '@/controllers/tenant.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Dados do estabelecimento ativo e equipe. */
export const tenantRoutes = Router();

tenantRoutes.use(authenticate);

tenantRoutes.get('/', tenantController.show);
tenantRoutes.patch('/', authorize('OWNER'), tenantController.update);

tenantRoutes.get('/members', authorize(...MANAGERS), tenantController.listMembers);
tenantRoutes.post('/members', authorize('OWNER'), tenantController.addMember);
tenantRoutes.patch('/members/:userId', authorize('OWNER'), tenantController.updateMember);
tenantRoutes.delete('/members/:userId', authorize('OWNER'), tenantController.removeMember);
