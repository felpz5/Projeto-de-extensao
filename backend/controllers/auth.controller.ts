import type { CookieOptions, Request, Response } from 'express';
import { env } from '@/config/env';
import { authService, REFRESH_RACE } from '@/services/auth.service';
import { storesService } from '@/services/stores.service';
import type { IssuedSession } from '@/types/auth.types';
import { AppError } from '@/utils/app-error';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  storesOverviewQuery,
  switchTenantSchema,
  updateProfileSchema,
} from '@/validations/auth.validation';
import { uuid } from '@/validations/common.validation';

export const REFRESH_COOKIE = 'gestock_rt';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/auth',
  };
}

/** O refresh token vai só no cookie httpOnly; o access token vai no corpo. */
function sendSession(res: Response, session: IssuedSession, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions(),
    expires: session.refreshExpiresAt,
  });
  return res.status(status).json({
    accessToken: session.accessToken,
    user: session.user,
    tenant: session.tenant,
  });
}

const refreshCookie = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE];

export class AuthController {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    return sendSession(res, await authService.register(data), 201);
  }

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    return sendSession(res, await authService.login(data));
  }

  async refresh(req: Request, res: Response) {
    try {
      return sendSession(res, await authService.refresh(refreshCookie(req)));
    } catch (err) {
      // Na corrida entre abas o cookie NOVO já foi gravado pela outra requisição: não apagar.
      if (!(err instanceof AppError && err.code === REFRESH_RACE)) {
        res.clearCookie(REFRESH_COOKIE, cookieOptions());
      }
      throw err;
    }
  }

  async logout(req: Request, res: Response) {
    await authService.logout(refreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    return res.status(204).send();
  }

  async switchTenant(req: Request, res: Response) {
    const { tenantId } = switchTenantSchema.parse(req.body);
    const session = await authService.switchTenant(req.user!, tenantId, refreshCookie(req));
    return sendSession(res, session);
  }

  async me(req: Request, res: Response) {
    return res.json(await authService.me(req.user!));
  }

  /** Editar o próprio nome/e-mail (e-mail exige a senha atual). */
  async updateProfile(req: Request, res: Response) {
    const data = updateProfileSchema.parse(req.body);
    return res.json(await authService.updateProfile(req.user!, data));
  }

  /** Resumo de todas as lojas em que a pessoa é dona ou gerente. */
  async stores(req: Request, res: Response) {
    const { days } = storesOverviewQuery.parse(req.query);
    return res.json(await storesService.overview(req.user!, days));
  }

  /** Troca a senha; encerra as outras sessões e devolve uma sessão nova para este aparelho. */
  async changePassword(req: Request, res: Response) {
    const data = changePasswordSchema.parse(req.body);
    return sendSession(res, await authService.changePassword(req.user!, data));
  }

  async listInvitations(req: Request, res: Response) {
    return res.json(await authService.listInvitations(req.user!.userId));
  }

  async acceptInvitation(req: Request, res: Response) {
    const tenantId = uuid.parse(req.params.tenantId);
    return res.json(await authService.acceptInvitation(req.user!, tenantId));
  }

  async declineInvitation(req: Request, res: Response) {
    const tenantId = uuid.parse(req.params.tenantId);
    await authService.declineInvitation(req.user!, tenantId);
    return res.status(204).send();
  }
}

export const authController = new AuthController();
