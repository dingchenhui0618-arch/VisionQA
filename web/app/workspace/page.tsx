import { cookies } from "next/headers";
import { Workspace } from "../workspace";
import {
  getTrialAccountFromSessionToken,
  TRIAL_SESSION_COOKIE_NAME,
} from "../../lib/visionqa/trial-auth";

export default async function WorkspacePage() {
  const cookieStore = await cookies();
  const initialAccount = getTrialAccountFromSessionToken(
    cookieStore.get(TRIAL_SESSION_COOKIE_NAME)?.value,
  );
  return <Workspace initialAccount={initialAccount} />;
}
