import { getPaymentCapability } from "../../../lib/beta/payment";

export function GET() {
  return Response.json(getPaymentCapability(), { headers: { "cache-control": "no-store" } });
}
