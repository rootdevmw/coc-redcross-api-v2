import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateProgramTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  typeId!: string;

  @IsOptional()
  @IsString()
  homecellId?: string;

  @IsArray()
  items!: {
    title: string;
    description?: string;
    time?: string;
    sequence: number;
    responsibleId?: string;
  }[];
}
