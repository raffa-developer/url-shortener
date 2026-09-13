import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  ValidationError,
  isReservedShortCode,
  isValidCustomAlias,
  normalizeUrl,
  randomShortCode,
  type LinkDTO,
  type PaginatedLinks,
} from "@url-shortener/shared";
import type { AppConfig } from "../../config";
import { isUniqueConstraintError } from "../../db";
import type { LinkRecord, LinkRepository } from "./link.repository";
import type { CreateLinkBody } from "./link.schemas";

export class LinkService {
  private readonly config: AppConfig;
  private readonly generateShortCode: () => string;

  constructor(
    private readonly repository: LinkRepository,
    config: AppConfig,
    generateShortCode?: () => string,
  ) {
    this.config = config;
    this.generateShortCode =
      generateShortCode ?? (() => randomShortCode(this.config.shortCodeLength));
  }

  async create(input: CreateLinkBody, userId: string): Promise<LinkDTO> {
    const destinationUrl = this.validateDestination(input.destinationUrl);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new ValidationError("expiresAt must be in the future");
    }

    if (input.customAlias) {
      return this.createWithAlias(userId, input.customAlias, destinationUrl, expiresAt);
    }

    return this.createWithGeneratedCode(userId, destinationUrl, expiresAt);
  }

  async list(
    userId: string,
    params: { limit: number; cursor?: string },
  ): Promise<PaginatedLinks> {
    const { data, nextCursor } = await this.repository.list({ ...params, userId });
    return { data: data.map((record) => this.toDTO(record)), nextCursor };
  }

  async getByShortCode(shortCode: string, userId: string): Promise<LinkDTO> {
    const link = await this.repository.findByShortCode(shortCode);
    if (!link) {
      throw new NotFoundError("Short link not found");
    }
    if (link.userId !== userId) {
      throw new ForbiddenError("This link belongs to another account");
    }
    return this.toDTO(link);
  }

  async resolveLink(shortCode: string): Promise<LinkRecord> {
    const link = await this.repository.findByShortCode(shortCode);
    if (!link) {
      throw new NotFoundError("Short link not found");
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new GoneError("This link has expired");
    }
    return link;
  }

  private async createWithAlias(
    userId: string,
    alias: string,
    destinationUrl: string,
    expiresAt: Date | null,
  ): Promise<LinkDTO> {
    if (!isValidCustomAlias(alias)) {
      throw new ValidationError(
        "Custom alias must be 3-32 characters using letters, numbers, hyphens or underscores",
      );
    }
    if (isReservedShortCode(alias)) {
      throw new ConflictError("That alias is reserved", { alias });
    }

    try {
      const link = await this.repository.create({
        userId,
        shortCode: alias,
        destinationUrl,
        expiresAt,
      });
      return this.toDTO(link);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("That alias is already taken", { alias });
      }
      throw error;
    }
  }

  private async createWithGeneratedCode(
    userId: string,
    destinationUrl: string,
    expiresAt: Date | null,
  ): Promise<LinkDTO> {
    for (let attempt = 0; attempt < this.config.shortCodeMaxAttempts; attempt += 1) {
      const shortCode = this.generateShortCode();
      try {
        const link = await this.repository.create({
          userId,
          shortCode,
          destinationUrl,
          expiresAt,
        });
        return this.toDTO(link);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError(
      "Could not allocate a unique short code, please try again",
    );
  }

  private validateDestination(raw: string): string {
    try {
      return normalizeUrl(raw);
    } catch {
      throw new ValidationError("destinationUrl must be a valid http(s) URL");
    }
  }

  private toDTO(link: LinkRecord): LinkDTO {
    return {
      id: link.id,
      shortCode: link.shortCode,
      shortUrl: `${this.config.baseUrl}/${link.shortCode}`,
      destinationUrl: link.destinationUrl,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      clickCount: link.clickCount,
    };
  }
}
