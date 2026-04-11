import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  expiryDate?: string;

  @IsOptional()
  @IsArray()
  targets?: {
    targetType: 'MINISTRY' | 'HOMECELL' | 'ROLE';
    targetId: string;
  }[];
}
