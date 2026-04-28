import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core/constants';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AttentionModule } from './modules/attention/attention.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesGuard } from './modules/auth/guard/roles.guard';
import { SessionAuthGuard } from './modules/auth/guard/session.guard';
import { ContentModule } from './modules/content/content.module';
import { EmailModule } from './modules/email/email.module';
import { EventsModule } from './modules/events/events.module';
import { HomecellsModule } from './modules/homecells/homecells.module';
import { MembersModule } from './modules/members/members.module';
import { MinistriesModule } from './modules/ministries/ministries.module';
import { ProgramTemplatesModule } from './modules/program-templates/program-template.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { PublicationsModule } from './modules/publications/publications.module';
import { RolesModule } from './modules/roles/roles.module';
import { StreamsModule } from './modules/streams/streams.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MembersModule,
    HomecellsModule,
    MinistriesModule,
    ContentModule,
    AnnouncementsModule,
    ProgramsModule,
    EventsModule,
    PublicationsModule,
    StreamsModule,
    AuthModule,
    RolesModule,
    UsersModule,
    AttentionModule,
    ProgramTemplatesModule,
    AuditModule,
    EmailModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
