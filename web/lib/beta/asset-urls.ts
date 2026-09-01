import { DOWNLOAD_URL_TTL_SECONDS, CustomerVisibleError, type BetaSessionView } from "./contracts.ts";

export async function createSignedDownloadUrl(
  session: BetaSessionView,
  assetId: string,
  now = Date.now(),
): Promise<string> {
  const expires = Math.floor(now / 1000) + DOWNLOAD_URL_TTL_SECONDS;
  const signature = await sign(session, assetId, expires);
  return `/api/assets/${encodeURIComponent(assetId)}?download=1&expires=${expires}&sig=${signature}`;
}

export async function verifySignedDownloadUrl(
  session: BetaSessionView,
  assetId: string,
  url: URL,
  now = Date.now(),
): Promise<void> {
  const expires = Number(url.searchParams.get("expires"));
  const supplied = url.searchParams.get("sig") ?? "";
  if (!Number.isInteger(expires) || expires < Math.floor(now / 1000) || expires > Math.floor(now / 1000) + DOWNLOAD_URL_TTL_SECONDS + 5) {
    throw expired();
  }
  const expected = await sign(session, assetId, expires);
  if (!constantTimeEqual(supplied, expected)) throw expired();
}

async function sign(session: BetaSessionView, assetId: string, expires: number): Promise<string> {
  const secret = process.env.VISIONQA_ASSET_URL_SIGNING_SECRET ?? "visionqa-development-download-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${session.tenantId}:${assetId}:${expires}:download`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function expired() {
  return new CustomerVisibleError(
    "FORBIDDEN",
    "这个下载链接已经失效。",
    403,
    "返回项目交付页重新获取下载链接。",
  );
}
