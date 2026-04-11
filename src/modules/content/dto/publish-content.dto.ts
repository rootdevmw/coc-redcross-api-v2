import { IsString } from 'class-validator';

export class PublishContentDto {
  @IsString()
  status!: string; // Draft | Published | Archived
}
