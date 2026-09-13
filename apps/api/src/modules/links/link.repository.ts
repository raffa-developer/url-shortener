import type { LinkSort, LinkStatusFilter } from "@url-shortener/shared";
import type { Database } from "../../db";
import { Prisma } from "../../generated/prisma/client";

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

export interface ListLinksParams {
  userId: string;
  page: number;
  pageSize: number;
  q?: string;
  status: LinkStatusFilter;
  sort: LinkSort;
  now?: Date;
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

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function buildWhere(params: ListLinksParams): Prisma.LinkWhereInput {
  const now = params.now ?? new Date();
  const where: Prisma.LinkWhereInput = { userId: params.userId };

  if (params.q) {
    where.OR = [
      { shortCode: { contains: params.q, mode: "insensitive" } },
      { destinationUrl: { contains: params.q, mode: "insensitive" } },
    ];
  }

  switch (params.status) {
    case "active":
      where.AND = [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }];
      break;
    case "expiring":
      where.expiresAt = {
        gt: now,
        lte: new Date(now.getTime() + EXPIRING_WINDOW_MS),
      };
      break;
    case "expired":
      where.expiresAt = { lte: now };
      break;
    case "all":
      break;
  }

  return where;
}

function buildOrderBy(sort: LinkSort): Prisma.LinkOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "clicks":
      return [{ clicks: { _count: "desc" } }, { createdAt: "desc" }];
    case "expires":
      return [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
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

  async list(
    params: ListLinksParams,
  ): Promise<{ data: LinkRecord[]; total: number }> {
    const where = buildWhere(params);

    const [rows, total] = await Promise.all([
      this.db.link.findMany({
        where,
        orderBy: buildOrderBy(params.sort),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: linkWithCountSelect,
      }),
      this.db.link.count({ where }),
    ]);

    return { data: rows.map(toRecord), total };
  }
}
