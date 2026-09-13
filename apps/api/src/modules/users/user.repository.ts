import type { Database } from "../../db";

export interface UserRecord {
  id: string;
  email: string;
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
}
