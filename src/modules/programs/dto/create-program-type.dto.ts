import { IsString } from 'class-validator';

export class CreateProgramTypeDto {
  @IsString()
  name!: string;
}
