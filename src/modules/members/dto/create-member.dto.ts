import { IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateMemberDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  status!: string; // Visitor | Member | Baptized

  @IsOptional()
  @IsDateString()
  baptismDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  homecellId?: string;
}
