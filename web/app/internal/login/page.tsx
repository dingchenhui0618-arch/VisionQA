import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getTrialAccountFromSessionToken,
  TRIAL_SESSION_COOKIE_NAME,
} from "../../../lib/visionqa/trial-auth";
import { InternalLoginClient } from "./internal-login-client";

export default async function InternalLoginPage() {
  if (process.env.NODE_ENV === "production") redirect("/login");
  const cookieStore = await cookies();
  if (getTrialAccountFromSessionToken(cookieStore.get(TRIAL_SESSION_COOKIE_NAME)?.value)) {
    redirect("/internal");
  }
  return <InternalLoginClient />;
}
