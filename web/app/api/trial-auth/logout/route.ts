import { clearTrialSessionCookie } from "../../../../lib/visionqa/trial-auth";

export function POST(request: Request) {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearTrialSessionCookie(request.url),
      },
    },
  );
}
