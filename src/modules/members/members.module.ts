import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { PublicMembersController } from './members.public.controller';

@Module({
  controllers: [MembersController, PublicMembersController],
  providers: [MembersService, AuditService, RequestContextService],
})
export class MembersModule {}
