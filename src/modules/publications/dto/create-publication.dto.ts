import { IsOptional, IsString, IsDateString } from 'class-validator';

export class CreatePublicationDto {
  @IsString()
  title!: string;

  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
