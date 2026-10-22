import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export function dashboardCalendar(now: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Blantyre',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === name)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  return { today, dayStart: new Date(today + 'T00:00:00+02:00') };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async care() {
    const generatedAt = new Date();
    const openPrayers = {
      status: { in: ['PENDING', 'REVIEWED'] as ('PENDING' | 'REVIEWED')[] },
    };
    const [prayers, urgentPrayers, visitors] = await this.prisma.$transaction(
      [
        this.prisma.prayerRequest.count({ where: openPrayers }),
        this.prisma.prayerRequest.count({
          where: { ...openPrayers, isUrgent: true },
        }),
        this.prisma.visitor.count({ where: { status: 'PENDING' } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { data: { generatedAt, prayers, urgentPrayers, visitors } };
  }

  async planning() {
    const generatedAt = new Date();
    const { today, dayStart } = dashboardCalendar(generatedAt);
    const eventsWhere = { deletedAt: null, endTime: { gt: generatedAt } };
    const programsWhere = { deletedAt: null, date: { gte: dayStart } };
    const [eventCount, events, programCount, programs] =
      await this.prisma.$transaction(
        [
          this.prisma.event.count({ where: eventsWhere }),
          this.prisma.event.findMany({
            where: eventsWhere,
            take: 3,
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              location: true,
            },
          }),
          this.prisma.program.count({ where: programsWhere }),
          this.prisma.program.findMany({
            where: programsWhere,
            take: 3,
            orderBy: [{ date: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              date: true,
              location: true,
              type: { select: { name: true } },
              homecell: { select: { name: true } },
            },
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
    return {
      data: {
        generatedAt,
        today,
        events: { total: eventCount, items: events },
        programs: { total: programCount, items: programs },
      },
    };
  }

  async publishing() {
    const generatedAt = new Date();
    const liveWhere = { deletedAt: null, isLive: true };
    const [messageDrafts, publicationDrafts, liveCount, liveStreams] =
      await this.prisma.$transaction(
        [
          this.prisma.content.count({
            where: { deletedAt: null, status: 'Draft' },
          }),
          this.prisma.publication.count({
            where: { deletedAt: null, publishedAt: null },
          }),
          this.prisma.stream.count({ where: liveWhere }),
          this.prisma.stream.findMany({
            where: liveWhere,
            take: 3,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true, title: true },
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
    return {
      data: {
        generatedAt,
        messageDrafts,
        publicationDrafts,
        selectedLive: { total: liveCount, items: liveStreams },
      },
    };
  }
}
