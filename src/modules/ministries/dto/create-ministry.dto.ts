import { IsOptional, IsString } from 'class-validator';

export class CreateMinistryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  leaderId?: string;

  @IsOptional()
  @IsString()
  overseerId?: string;
}
