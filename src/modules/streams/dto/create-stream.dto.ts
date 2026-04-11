import { IsOptional, IsString, IsBoolean, IsDateString } from 'class-validator';

export class CreateStreamDto {
  @IsString()
  title!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsBoolean()
  isLive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}
