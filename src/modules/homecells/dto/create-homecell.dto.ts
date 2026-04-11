import { IsOptional, IsString } from 'class-validator';

export class CreateHomecellDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  leaderId?: string;

  @IsOptional()
  @IsString()
  overseerId?: string;
}
