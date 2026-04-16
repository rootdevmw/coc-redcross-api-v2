import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateContentDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsString()
  typeId!: string;

  @IsOptional()
  @IsString()
  authorId!: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  scriptures?: {
    book: string;
    chapter: number;
    verseFrom: number;
    verseTo?: number;
  }[];
}
