import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthContext } from '../../common/auth-context';
import { Auth, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { Env } from '../../config/env';
import {
  LoginInput,
  loginSchema,
  RegisterInput,
  registerSchema,
  SwitchTenantInput,
  switchTenantSchema,
} from './auth.schemas';
import { AuthService, IssuedSession } from './auth.service';

export const REFRESH_COOKIE = 'gestock_rt';
const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(body));
  }

  @Public()
  @Throttle(STRICT_LIMIT)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(body));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @HttpCode(200)
  @Post('switch-tenant')
  async switchTenant(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(switchTenantSchema)) body: SwitchTenantInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.switchTenant(
      auth,
      body.tenantId,
      req.cookies?.[REFRESH_COOKIE],
    );
    return this.respond(res, session);
  }

  @Get('me')
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  /** O refresh token vai só no cookie httpOnly; o access token vai no corpo. */
  private respond(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user, tenant: session.tenant };
  }

  private cookieOptions(): CookieOptions {
    const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd || sameSite === 'none',
      sameSite,
      path: '/api/auth',
    };
  }
}
