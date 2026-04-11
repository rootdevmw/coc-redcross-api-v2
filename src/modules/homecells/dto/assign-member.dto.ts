import { IsString } from 'class-validator';

export class AssignMemberDto {
  @IsString()
  memberId!: string;
}
