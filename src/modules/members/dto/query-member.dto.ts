import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class QueryMemberDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  homecellId?: string;

  @IsOptional()
  @IsString()
  prefix?: string;
}
