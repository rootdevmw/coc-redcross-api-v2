import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsInt,
} from 'class-validator';

class ProgramItemDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsInt()
  sequence!: number;

  @IsOptional()
  @IsString()
  responsibleId?: string;
}

export class CreateProgramDto {
  @IsDateString()
  date!: string;

  @IsString()
  typeId!: string;

  @IsOptional()
  @IsString()
  homecellId?: string;

  @IsArray()
  items!: ProgramItemDto[];
}
