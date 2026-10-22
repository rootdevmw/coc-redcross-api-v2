import {
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateIf,
} from 'class-validator';

export class CreateStreamDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  isLive?: boolean;

  @IsOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== '')
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== '')
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platformIds?: string[];
}
