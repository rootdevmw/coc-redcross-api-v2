import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { accessListPagination } from '../../common/utils/access-list-filters';
import {
  attentionQueueFilters,
  prayerQueueWhere,
  visitorQueueWhere,
  type AttentionQueueQuery,
} from '../../common/utils/attention-queue-filters';

@Injectable()
export class AttentionQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async prayers(query: AttentionQueueQuery, canRecord: boolean) {
    const { page, limit } = accessListPagination(query);
    const filters = attentionQueueFilters('prayers', query);
    const where = prayerQueueWhere(query);
    const direction = filters.sort === 'newest' ? 'desc' : 'asc';
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.prayerRequest.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [
            ...(filters.sort === 'priority'
              ? [{ isUrgent: 'desc' as const }]
              : []),
            { createdAt: direction },
            { id: direction },
          ],
          select: {
            id: true,
            name: true,
            prayerFor: true,
            request: true,
            requestType: true,
            isUrgent: true,
            shareWithElders: true,
            status: true,
            createdAt: true,
          },
        }),
        this.prisma.prayerRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const data = rows.map(({ request, ...row }) => ({
      ...row,
      requestPreview: request.slice(0, 240),
      hasMoreRequest: request.length > 240,
    }));
    return { data, meta: { page, limit, total, canRecord } };
  }

  async visitors(query: AttentionQueueQuery, canRecord: boolean) {
    const { page, limit } = accessListPagination(query);
    const filters = attentionQueueFilters('visitors', query);
    const where = visitorQueueWhere(query);
    const direction = filters.sort === 'newest' ? 'desc' : 'asc';
    const [data, total] = await this.prisma.$transaction(
      [
        this.prisma.visitor.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ visitDate: direction }, { id: direction }],
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            visitDate: true,
            groupSize: true,
            language: true,
            hasSpecialNeeds: true,
            status: true,
            createdAt: true,
          },
        }),
        this.prisma.visitor.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { data, meta: { page, limit, total, canRecord } };
  }
}
