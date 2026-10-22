import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard/overview')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('care')
  @Roles('DEACON')
  care() {
    return this.service.care();
  }

  @Get('planning')
  @Roles('DEACON')
  planning() {
    return this.service.planning();
  }

  @Get('publishing')
  @Roles('MEDIA')
  publishing() {
    return this.service.publishing();
  }
}
