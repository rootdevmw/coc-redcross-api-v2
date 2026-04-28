import { IsOptional, IsNumberString } from 'class-validator';

export class QueryPublicationDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
