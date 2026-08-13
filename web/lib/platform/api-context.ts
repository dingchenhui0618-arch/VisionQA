import { getChatGPTUser } from "../../app/chatgpt-auth";
import { stableError } from "./contracts";

export const PILOT_TENANT_ID = "visionqa-internal-pilot";

export async function getApiContext(requestId: string): Promise<
  | { tenantId: string; actorId: string }
  | { response: Response }
> {
  const user = await getChatGPTUser();
  if (!user?.email) {
    return {
      response: stableError(
        "AUTHENTICATION_REQUIRED",
        "该操作需要已认证的内部试点账号",
        requestId,
        401,
      ),
    };
  }

  return {
    tenantId: PILOT_TENANT_ID,
    actorId: user.email,
  };
}
