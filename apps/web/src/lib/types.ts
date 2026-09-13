export type {
  LinkDTO,
  LinkSort,
  LinkStatusFilter,
  PaginatedLinks,
} from "@url-shortener/shared";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: AuthUser;
}

export interface ApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiKey {
  apiKey: ApiKeyDTO;
  /** Plaintext secret — only returned by the create endpoint. */
  key: string;
}

export interface UpdateLinkInput {
  destinationUrl?: string;
  expiresAt?: string | null;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface AnalyticsResponse {
  link: {
    id: string;
    shortCode: string;
    shortUrl: string;
    destinationUrl: string;
    expiresAt: string | null;
  };
  range: {
    days: number;
    from: string;
    to: string;
  };
  totalClicks: number;
  today: number;
  yesterday: number;
  clicksPerDay: { date: string; count: number }[];
  countries: { country: string; count: number }[];
  devices: { device: string; count: number }[];
  browsers: { browser: string; count: number }[];
  referrers: { source: string; count: number }[];
}
