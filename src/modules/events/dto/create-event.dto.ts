import { IsOptional, IsString, IsDateString } from 'class-validator';

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
  @IsString()
  ministryIds?: string[];
}
