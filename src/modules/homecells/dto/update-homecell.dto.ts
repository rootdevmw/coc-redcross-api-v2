import { PartialType } from '@nestjs/mapped-types';
import { CreateHomecellDto } from './create-homecell.dto';

export class UpdateHomecellDto extends PartialType(CreateHomecellDto) {}
