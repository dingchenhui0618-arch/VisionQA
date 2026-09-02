"use client";

import { useState } from "react";
import Link from "next/link";
import "../customer/customer.css";

type InviteError = { message: string; next_action?: string };

export function LoginClient({
  initialInvite,
  allowLocalInvite,
}: {
  initialInvite: string;
  allowLocalInvite: boolean;
}) {
  const [token, setToken] = useState(initialInvite);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<InviteError | null>(null);

  async function acceptInvite() {
    if (!token.trim() || status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/invites/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const payload = (await response.json()) as {
        redirect_to?: string;
        error?: InviteError;
      };
      if (!response.ok) throw payload.error ?? { message: "邀请没有生效。" };
      window.location.assign(payload.redirect_to ?? "/workspace");
    } catch (cause) {
      setError(
        cause && typeof cause === "object" && "message" in cause
          ? (cause as InviteError)
          : { message: "邀请没有生效。", next_action: "请检查网络后重试。" },
      );
      setStatus("idle");
    }
  }

  return (
    <main className="invite-entry">
      <Link className="invite-entry__brand" href="/" aria-label="返回 VisionQA 首页">VisionQA</Link>
      <section className="invite-entry__panel" aria-labelledby="invite-title">
        <div className="invite-entry__copy">
          <span>邀请制客户内测</span>
          <h1 id="invite-title">用邀请链接进入你的商品图工作区。</h1>
          <p>首次进入会获得 5 次内测额度。筛查免费，只有修正版成功返回并通过基础检查后才扣 1 次。</p>
        </div>
        <div className="invite-entry__form">
          <label htmlFor="invite-token">邀请口令</label>
          <input
            id="invite-token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="从邀请链接自动填入，或粘贴口令"
            autoComplete="one-time-code"
          />
          <button type="button" onClick={acceptInvite} disabled={!token.trim() || status === "submitting"}>
            {status === "submitting" ? "正在进入…" : "接受邀请并进入"}
          </button>
          {allowLocalInvite ? (
            <button
              className="invite-entry__dev"
              type="button"
              onClick={() => setToken("visionqa-local-beta")}
            >
              填入测试体验口令
            </button>
          ) : null}
          {error ? (
            <div className="invite-entry__error" role="alert">
              <strong>{error.message}</strong>
              {error.next_action ? <span>{error.next_action}</span> : null}
            </div>
          ) : null}
          <p className="invite-entry__fineprint">会话保留 30 天。会话丢失时，请让内测管理员重新发送恢复邀请。</p>
        </div>
      </section>
    </main>
  );
}
