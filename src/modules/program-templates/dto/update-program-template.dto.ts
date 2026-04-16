import { PartialType } from '@nestjs/mapped-types';
import { CreateProgramTemplateDto } from './create-program-template.dto';

export class UpdateProgramTemplateDto extends PartialType(
  CreateProgramTemplateDto,
) {}
