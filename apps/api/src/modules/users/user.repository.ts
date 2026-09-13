import type { Database } from "../../db";

export interface UserRecord {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface UserWithPasswordRecord extends UserRecord {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

const publicUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

export class UserRepository {
  constructor(private readonly db: Database) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findByEmailWithPassword(email: string): Promise<UserWithPasswordRecord | null> {
    return this.db.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    return this.db.user.create({
      data: input,
      select: publicUserSelect,
    });
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    await this.db.user.update({
      where: { id },
      data: { emailVerifiedAt: at },
    });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db.user.update({
      where: { id },
      data: { passwordHash },
    });
  }
}
