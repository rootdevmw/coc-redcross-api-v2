import { IsString } from 'class-validator';

export class CreateEventTypeDto {
  @IsString()
  name!: string;
}
