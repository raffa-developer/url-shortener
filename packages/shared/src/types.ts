export interface LinkDTO {
  id: string;
  shortCode: string;
  shortUrl: string;
  destinationUrl: string;
  createdAt: string;
  expiresAt: string | null;
  clickCount: number;
}

export interface CreateLinkInput {
  destinationUrl: string;
  customAlias?: string;
  expiresAt?: string | null;
}

export interface ListLinksQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: LinkStatusFilter;
  sort?: LinkSort;
}

export type LinkStatusFilter = "all" | "active" | "expiring" | "expired";
export type LinkSort = "newest" | "oldest" | "clicks" | "expires";

export interface PaginatedLinks {
  data: LinkDTO[];
  page: number;
  pageSize: number;
  total: number;
}
