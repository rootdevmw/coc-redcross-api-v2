import {
  IsOptional,
  IsString,
  IsDateString,
  IsBoolean,
  IsArray,
  ArrayUnique,
  ValidateIf,
} from 'class-validator';

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
  @ValidateIf((_object: unknown, value: unknown) => value !== '')
  @IsDateString()
  baptismDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  homecellId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  ministryIds?: string[];

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
