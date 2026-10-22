import { IsOptional, IsString, IsDateString, IsArray } from 'class-validator';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsString()
  typeId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ministryIds?: string[];
}
