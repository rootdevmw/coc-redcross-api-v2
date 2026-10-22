import {
  IsOptional,
  IsString,
  IsDateString,
  ValidateIf,
} from 'class-validator';

export class CreatePublicationDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== '')
  @IsDateString()
  publishedAt?: string | null;
}
