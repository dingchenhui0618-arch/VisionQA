#!/usr/bin/env node

const baseUrl = (process.argv[2] ?? process.env.VISIONQA_BASE_URL ?? "http://127.0.0.1:3210").replace(/\/$/, "");

async function check(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...options });
  const text = await response.text();
  return { path, status: response.status, contentType: response.headers.get("content-type") ?? "", text };
}

const health = await check("/api/health", { cache: "no-store" });
const payment = await check("/api/payment-capability", { cache: "no-store" });
const login = await check("/login");
const workspace = await check("/workspace");

let paymentPayload;
try {
  paymentPayload = JSON.parse(payment.text);
} catch {
  paymentPayload = null;
}

const checks = {
  health: health.status === 200,
  paymentDisabled: payment.status === 200 && paymentPayload?.enabled === false && paymentPayload?.provider === "disabled",
  login: login.status === 200 && login.text.includes("邀请制客户内测"),
  workspace: workspace.status === 200 || (workspace.status >= 300 && workspace.status < 400),
};

const result = {
  baseUrl,
  checks,
  observed: {
    health: health.status,
    payment: payment.status,
    login: login.status,
    workspace: workspace.status,
  },
};

console.log(JSON.stringify(result));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
