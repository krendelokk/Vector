import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { ALL_ROLES, AuthUser } from '../common/types';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';

const COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.auth.refreshDays() * 24 * 3600 * 1000,
    };
  }

  @Public()
  // Ліміт за IP високий (за NAT університету всі мають одну адресу); підбір пароля стримує ліміт за email в AuthService
  @Throttle({ default: { limit: () => Number(process.env.LOGIN_RATE_LIMIT ?? 60), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.login(dto.email, dto.password);
    res.cookie(COOKIE, refreshToken, this.cookieOptions());
    return rest;
  }

  // Окремого ліміту немає: оновлення вимагає дійсного httpOnly-cookie, а сторінка викликає його при кожному завантаженні
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.refresh(req.cookies?.[COOKIE]);
    res.cookie(COOKIE, refreshToken, this.cookieOptions());
    return rest;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }

  @Get('me')
  @Roles(...ALL_ROLES)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @Roles(...ALL_ROLES)
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
