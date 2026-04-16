import { IsString, IsOptional } from 'class-validator';

export class CreateProgramFromTemplateDto {
  @IsString()
  templateId!: string;

  @IsString()
  date!: string;

  @IsOptional()
  @IsString()
  homecellId?: string;
}
