import type { PaymentProvider } from "./contracts.ts";

export type PaymentCapability = {
  provider: PaymentProvider;
  enabled: boolean;
  customerMessage: string;
};

export function getPaymentCapability(
  env: Record<string, string | undefined> = process.env,
): PaymentCapability {
  const requested = (env.VISIONQA_PAYMENT_PROVIDER ?? "disabled") as PaymentProvider;
  const environment = env.NODE_ENV ?? "development";
  if (requested === "test" && environment !== "production") {
    return { provider: "test", enabled: true, customerMessage: "仅开发环境测试支付，不产生真实订单。" };
  }
  return {
    provider: "disabled",
    enabled: false,
    customerMessage: "当前为邀请制内测。如需更多额度，请联系内测管理员。",
  };
}
