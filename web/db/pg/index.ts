import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type PgQueryResultLike<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type PgQueryable = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResultLike<T>>;
};

export type PgClientLike = PgQueryable & {
  release(): void;
};

export type PgPoolLike = PgQueryable & {
  connect(): Promise<PgClientLike>;
  end?(): Promise<void>;
};

export function createPostgresPool(config: PoolConfig): Pool {
  return new Pool({
    ...config,
    ssl: config.ssl ?? { rejectUnauthorized: true },
    max: config.max ?? 5,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
  });
}

export function createPostgresDb(pool: Pool) {
  return drizzle(pool, { schema });
}
