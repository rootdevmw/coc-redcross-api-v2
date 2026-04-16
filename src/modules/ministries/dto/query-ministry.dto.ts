import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class QueryMinistryDto {
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
  @IsNumberString()
  leaderId?: string;

  @IsOptional()
  @IsNumberString()
  overseerId?: string;
}
