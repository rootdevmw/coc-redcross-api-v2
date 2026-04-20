import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { MembersModule } from './modules/members/members.module';
import { HomecellsModule } from './modules/homecells/homecells.module';
import { MinistriesModule } from './modules/ministries/ministries.module';
import { ContentModule } from './modules/content/content.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { EventsModule } from './modules/events/events.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { NewslettersModule } from './modules/newsletters/newsletters.module';
import { StreamsModule } from './modules/streams/streams.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { ProgramTemplatesModule } from './modules/program-templates/program-template.module';
import { SessionAuthGuard } from './modules/auth/guard/session.guard';
import { APP_GUARD } from '@nestjs/core/constants';

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
    NewslettersModule,
    StreamsModule,
    AuthModule,
    RolesModule,
    UsersModule,
    ProgramTemplatesModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: SessionAuthGuard }],
})
export class AppModule {}
