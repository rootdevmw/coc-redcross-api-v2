import { IsString } from 'class-validator';

export class CreateContentTypeDto {
  @IsString()
  name!: string;
}
