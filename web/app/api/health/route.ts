export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "visionqa",
      probe: "liveness",
      releaseMode: process.env.VISIONQA_RELEASE_MODE ?? (process.env.NODE_ENV === "production" ? "production" : "local"),
      paymentProvider: process.env.VISIONQA_PAYMENT_PROVIDER ?? "disabled",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
