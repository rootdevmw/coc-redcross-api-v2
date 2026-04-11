import { IsOptional, IsNumberString } from 'class-validator';

export class QueryAnnouncementDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;

  @IsOptional()
  activeOnly?: boolean;
}
