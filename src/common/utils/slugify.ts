import { Injectable } from '@nestjs/common';
import slugify from 'slugify';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SlugService {
  constructor(private prisma: PrismaService) {}

  async generateUniqueSlug(
    text: string,
    model: keyof PrismaService,
    field: string = 'slug',
  ): Promise<string> {
    const baseSlug = slugify(text, {
      lower: true,
      strict: true,
    });

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const exists = await (this.prisma[model] as any).findFirst({
        where: { [field]: slug },
        select: { id: true },
      });

      if (!exists) return slug;

      slug = `${baseSlug}-${counter++}`;
    }
  }
}
