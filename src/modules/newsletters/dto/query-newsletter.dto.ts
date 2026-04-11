import { IsOptional, IsNumberString } from 'class-validator';

export class QueryNewsletterDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
