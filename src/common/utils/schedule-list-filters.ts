import { BadRequestException } from '@nestjs/common';

type ScheduleQuery = {
  search?: string;
  typeId?: string;
  homecellId?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  fromDate?: string;
};

function recordId(value?: string) {
  if (!value) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException('Choose a valid type or homecell.');
  }
  return BigInt(value);
}

// Date-only filters describe calendar days in Malawi, independent of server TZ.
// Timestamp filters retain their exact instant for existing API consumers.
function boundary(value: string, endOfDay = false) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Choose a valid date.');
  }
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (calendarDay) {
    const parsed = new Date(value + 'T00:00:00Z');
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Choose a valid calendar date.');
    }
  }
  const date = new Date(calendarDay ? value + 'T00:00:00+02:00' : value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException('Choose a valid date.');
  }
  if (calendarDay && endOfDay) {
    date.setTime(date.getTime() + 86400000 - 1);
  }
  return date;
}

function searchText(value?: string) {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new BadRequestException('Search must be text.');
  }
  return value.trim();
}

export function eventListWhere(query: ScheduleQuery) {
  const search = searchText(query.search);
  const gte = query.startDate ? boundary(query.startDate) : undefined;
  const lte = query.endDate ? boundary(query.endDate, true) : undefined;
  if (gte && lte && gte > lte) {
    throw new BadRequestException('The end date must follow the start date.');
  }
  return {
    deletedAt: null,
    ...(search && { title: { contains: search } }),
    ...(query.typeId && { typeId: recordId(query.typeId) }),
    ...((gte || lte) && { startTime: { gte, lte } }),
  };
}

export function programListWhere(query: ScheduleQuery) {
  // An exact program date is a calendar day, including legacy timestamp input.
  const day = query.date
    ? new Date(boundary(query.date).getTime() + 7200000)
        .toISOString()
        .slice(0, 10)
    : undefined;
  const date = day
    ? { gte: boundary(day), lte: boundary(day, true) }
    : query.fromDate
      ? { gte: boundary(query.fromDate) }
      : undefined;
  return {
    deletedAt: null,
    ...(query.homecellId && { homecellId: recordId(query.homecellId) }),
    ...(query.typeId && { typeId: recordId(query.typeId) }),
    ...(date && { date }),
  };
}

export function templateListWhere(query: ScheduleQuery) {
  const search = searchText(query.search);
  return {
    deletedAt: null,
    ...(search && { name: { contains: search } }),
    ...(query.homecellId && { homecellId: recordId(query.homecellId) }),
    ...(query.typeId && { typeId: recordId(query.typeId) }),
  };
}
