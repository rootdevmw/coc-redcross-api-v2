// Read-only review of selected broadcasts. Does not change flags, dates or recordings.
function reviewLiveSelection(stream, now = Date.now()) {
  const start =
    stream.startsAt == null ? NaN : new Date(stream.startsAt).getTime();
  const end = stream.endsAt == null ? NaN : new Date(stream.endsAt).getTime();
  if (!Number.isFinite(start)) return 'missing-start';
  if (!Number.isFinite(end)) return 'missing-end';
  if (end <= start) return 'invalid-window';
  if (end <= now) return 'expired';
  if (start > now) return 'future-selection';
  return 'current-window-confirm-provider';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('configuration');
  const { PrismaClient } = require('../dist/src/generated/prisma/client.js');
  const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
  const url = new URL(process.env.DATABASE_URL);
  const db = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      connectionLimit: 1,
      connectTimeout: 5000,
    }),
  });
  try {
    const rows = await db.stream.findMany({
      where: { deletedAt: null, isLive: true },
      select: { id: true, title: true, startsAt: true, endsAt: true },
      orderBy: { id: 'asc' },
    });
    const now = Date.now();
    for (const row of rows)
      console.log(
        JSON.stringify({
          id: row.id.toString(),
          title: row.title,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          review: reviewLiveSelection(row, now),
        }),
      );
    console.log(
      `Reviewed ${rows.length} selected broadcasts. No records changed.`,
    );
  } finally {
    await db.$disconnect();
  }
}
module.exports = { reviewLiveSelection };
if (require.main === module)
  main().catch(() => {
    console.error(
      'Broadcast review failed. Check the API build and database configuration. No credentials are printed.',
    );
    process.exitCode = 1;
  });
