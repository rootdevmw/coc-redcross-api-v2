import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma/prisma.service';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { RolesGuard } from './guard/roles.guard';

@Module({
  imports: [
    ConfigModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN')! as any, //  cast
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, PrismaService, RolesGuard],

  exports: [AuthService, JwtModule],
})
export class AuthModule {}
