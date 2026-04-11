import { IsOptional, IsNumberString } from 'class-validator';

export class QueryRoleDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
