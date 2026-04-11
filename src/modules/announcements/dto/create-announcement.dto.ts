import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsNumber()
  priority!: number;

  @IsOptional()
  expiryDate?: string;

  @IsArray()
  targets!: {
    targetType: 'MINISTRY' | 'HOMECELL' | 'ROLE';
    targetId: string;
  }[];
}
