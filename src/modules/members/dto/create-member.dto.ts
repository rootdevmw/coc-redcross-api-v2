import { IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';

export class CreateMemberDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  prefix!: string; //PASTOR, DEACON, SISTER, BROTHER

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  status!: string; // Visitor | Member

  @IsBoolean()
  isBaptized!: boolean;

  @IsOptional()
  @IsDateString()
  baptismDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  homecellId?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
