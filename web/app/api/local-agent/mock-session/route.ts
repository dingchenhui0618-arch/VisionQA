import { localMockEnabled, MOCK_COOKIE } from "../../../../lib/agent/mock-mode";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!localMockEnabled() || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== url.origin) return new Response("Invalid origin", { status: 403 });
  const logout = url.searchParams.get("logout") === "1";
  // Preview navigation marker only: NEVER accepted by real account/asset/model APIs.
  return new Response(null, { status: 303, headers: {
    location: logout ? "/login" : "/agent",
    "set-cookie": `${MOCK_COOKIE}=${logout ? "" : "1"}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${logout ? 0 : 86400}`,
    "cache-control": "no-store",
  } });
}
