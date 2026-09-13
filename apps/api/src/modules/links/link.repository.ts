import type { Database } from "../../db";

export interface LinkRecord {
  id: string;
  userId: string;
  shortCode: string;
  destinationUrl: string;
  createdAt: Date;
  expiresAt: Date | null;
  clickCount: number;
}

export interface CreateLinkRecordInput {
  userId: string;
  shortCode: string;
  destinationUrl: string;
  expiresAt: Date | null;
}

interface LinkRow {
  id: string;
  userId: string;
  shortCode: string;
  destinationUrl: string;
  createdAt: Date;
  expiresAt: Date | null;
}

interface LinkWithCountRow extends LinkRow {
  _count: { clicks: number };
}

const linkSelect = {
  id: true,
  userId: true,
  shortCode: true,
  destinationUrl: true,
  createdAt: true,
  expiresAt: true,
} as const;

const linkWithCountSelect = {
  ...linkSelect,
  _count: { select: { clicks: true } },
} as const;

function toRecord(row: LinkWithCountRow): LinkRecord {
  const { _count, ...link } = row;
  return { ...link, clickCount: _count.clicks };
}

export class LinkRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateLinkRecordInput): Promise<LinkRecord> {
    const row = await this.db.link.create({ data: input, select: linkSelect });
    return { ...row, clickCount: 0 };
  }

  async findByShortCode(shortCode: string): Promise<LinkRecord | null> {
    const row = await this.db.link.findUnique({
      where: { shortCode },
      select: linkWithCountSelect,
    });
    return row ? toRecord(row) : null;
  }

  async update(
    shortCode: string,
    data: { destinationUrl?: string; expiresAt?: Date | null },
  ): Promise<LinkRecord> {
    const row = await this.db.link.update({
      where: { shortCode },
      data,
      select: linkWithCountSelect,
    });
    return toRecord(row);
  }

  async delete(shortCode: string): Promise<void> {
    await this.db.link.delete({ where: { shortCode } });
  }

  async list(params: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ data: LinkRecord[]; nextCursor: string | null }> {
    const rows = await this.db.link.findMany({
      where: { userId: params.userId },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: linkWithCountSelect,
    });

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const data = page.map(toRecord);
    const last = data.at(-1);

    return {
      data,
      nextCursor: hasMore && last ? last.id : null,
    };
  }
}
