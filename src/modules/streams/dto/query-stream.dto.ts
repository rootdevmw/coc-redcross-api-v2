import { IsOptional, IsNumberString } from 'class-validator';

export class QueryStreamDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
