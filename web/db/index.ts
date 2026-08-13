import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type D1ResultLike<T = Record<string, unknown>> = {
  results?: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<T>[]>;
};

async function getCloudflareEnvironment(): Promise<{
  DB?: D1DatabaseLike;
}> {
  // Keep the Cloudflare-only URL scheme out of page SSR and Node test imports.
  // This function is reached only while an API route is handling a DB request.
  const runtime = await import("cloudflare:workers");
  return runtime.env as { DB?: D1DatabaseLike };
}

export async function getD1(): Promise<D1DatabaseLike> {
  const env = await getCloudflareEnvironment();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.",
    );
  }

  return env.DB as D1DatabaseLike;
}

export function getDb() {
  return getD1().then((database) => drizzle(database as never, { schema }));
}
