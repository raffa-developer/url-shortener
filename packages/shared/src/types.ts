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
  limit?: number;
  cursor?: string;
}

export interface PaginatedLinks {
  data: LinkDTO[];
  nextCursor: string | null;
}
