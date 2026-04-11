import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guard/jwt-guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private service: AuthService,
    private config: ConfigService,
  ) {}

  private getCookieName(): string {
    return this.config.get<string>('COOKIE_NAME')!;
  }

  private getCookieOptions() {
    return {
      httpOnly: this.config.get<string>('COOKIE_HTTP_ONLY') === 'true',
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('COOKIE_SAME_SITE'),
      maxAge: Number(this.config.get<string>('COOKIE_MAX_AGE')),
    };
  }

  // -----------------------------
  // REGISTER
  // -----------------------------
  @Post('register')
  register(@Body() dto: any) {
    return this.service.register(dto);
  }

  // -----------------------------
  // LOGIN (SET COOKIE)
  // -----------------------------
  @Post('login')
  async login(@Body() dto: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.login(dto);

    res.cookie(
      this.getCookieName(),
      result.data.token,
      this.getCookieOptions(),
    );

    return {
      success: true,
      data: result.data.user,
      meta: {},
    };
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.getCookieName(), this.getCookieOptions());

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN ROLE
  // -----------------------------
  @Post('assign-role/:userId/:roleId')
  assignRole(@Param('userId') userId: string, @Param('roleId') roleId: string) {
    return this.service.assignRole(userId, roleId);
  }

  // -----------------------------
  // GET CURRENT USER
  // -----------------------------
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return {
      success: true,
      data: req.user,
      meta: {},
    };
  }
}
