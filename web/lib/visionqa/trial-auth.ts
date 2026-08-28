export const TRIAL_SESSION_COOKIE_NAME = "visionqa_trial_session";

export type TrialAccountSession = {
  id: "trial-01" | "trial-02";
  label: string;
  phoneMasked: string;
  storageScope: string;
};

type TrialAccount = TrialAccountSession & {
  phone: string;
  passwordDigest: string;
  sessionToken: string;
};

const PASSWORD_NAMESPACE = "visionqa-trial-v1";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const TRIAL_ACCOUNTS: readonly TrialAccount[] = [
  {
    id: "trial-01",
    label: "试用账号 01",
    phone: "13600549143",
    phoneMasked: "136****9143",
    passwordDigest: "2fc2fc0f61c5e9b3ea1d6c34b96f4f2afa3886accbfe1bd98854654fdd487bc7",
    sessionToken: "1f3e79d21b4642aa2e554d9243f92d46ea57b93398b29ef5047970aa8cca961f",
    storageScope: "trial-01",
  },
  {
    id: "trial-02",
    label: "试用账号 02",
    phone: "15700115180",
    phoneMasked: "157****5180",
    passwordDigest: "65c5a99115ea5ace613d014f304732b8067cac74a2628b922eb2c06a480cef71",
    sessionToken: "5c2eea97b12c6db7bfbeee0fccb141b10fc01aa512010c58cc63d2b4dffb4bd8",
    storageScope: "trial-02",
  },
] as const;

function publicAccount(account: TrialAccount): TrialAccountSession {
  return {
    id: account.id,
    label: account.label,
    phoneMasked: account.phoneMasked,
    storageScope: account.storageScope,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function authenticateTrialAccount(
  phoneInput: string,
  password: string,
): Promise<{ account: TrialAccountSession; sessionToken: string } | null> {
  const phone = phoneInput.replace(/\s+/g, "");
  const account = TRIAL_ACCOUNTS.find((candidate) => candidate.phone === phone);
  if (!account || password.length === 0 || password.length > 128) return null;
  const digest = await sha256Hex(`${PASSWORD_NAMESPACE}:${phone}:${password}`);
  if (!constantTimeEqual(digest, account.passwordDigest)) return null;
  return { account: publicAccount(account), sessionToken: account.sessionToken };
}

export function getTrialAccountFromSessionToken(
  token: string | null | undefined,
): TrialAccountSession | null {
  if (!token) return null;
  const account = TRIAL_ACCOUNTS.find((candidate) =>
    constantTimeEqual(token, candidate.sessionToken),
  );
  return account ? publicAccount(account) : null;
}

export function trialSessionCookie(token: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${TRIAL_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearTrialSessionCookie(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${TRIAL_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
