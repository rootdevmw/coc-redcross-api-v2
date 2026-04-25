import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Param,
  Res,
  Req,
  Delete,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { SessionAuthGuard } from './guard/session.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from './decorator/roles.decorator';

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
  // LOGIN
  // -----------------------------
  @Post('login')
  @Public()
  async login(@Body() dto: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.login(dto);

    res.cookie(
      this.getCookieName(),
      result.data.sessionId,
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
  @Public()
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.logout(req.cookies?.session_id);

    res.clearCookie(this.getCookieName(), this.getCookieOptions());

    return result;
  }

  // -----------------------------
  // REQUEST PASSWORD RESET
  // -----------------------------
  @Post('request-password-reset')
  @Public()
  requestReset(@Body('email') email: string) {
    return this.service.requestPasswordReset(email);
  }

  // -----------------------------
  // SET PASSWORD (FIRST TIME)
  // -----------------------------
  @Post('set-password')
  @Public()
  setPassword(@Body() dto: { token: string; password: string }) {
    return this.service.setPassword(dto);
  }

  // -----------------------------
  // RESET PASSWORD (FORGOT PASSWORD)
  // -----------------------------
  @Post('reset-password')
  @Public()
  resetPassword(@Body() dto: { token: string; password: string }) {
    return this.service.resetPassword(dto);
  }

  // -----------------------------
  // CHANGE PASSWORD (AUTH REQUIRED)
  // -----------------------------
  @Post('change-password')
  @UseGuards(SessionAuthGuard)
  @Roles('VISITOR')
  changePassword(
    @Request() req: any,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return this.service.changePassword(req.user.id, dto, req.user);
  }

  // -----------------------------
  // SET ROLE (REPLACES EXISTING ROLE)
  // -----------------------------
  @Post('users/:userId/role/:roleId')
  @UseGuards(SessionAuthGuard)
  @Roles('MEMBER')
  setRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Req() req: any,
  ) {
    return this.service.setRole(userId, roleId, req.user);
  }

  // -----------------------------
  // REMOVE ROLE (RESET TO NO ROLE)
  // -----------------------------
  @Delete('users/:userId/role')
  @UseGuards(SessionAuthGuard)
  @Roles('MEMBER')
  removeRole(@Param('userId') userId: string, @Req() req: any) {
    return this.service.removeRole(userId, req.user);
  }

  // -----------------------------
  // CURRENT USER
  // -----------------------------
  @Get('me')
  @UseGuards(SessionAuthGuard)
  @Roles('VISITOR')
  me(@Request() req: any) {
    return {
      success: true,
      data: req.user,
      meta: {},
    };
  }
}
