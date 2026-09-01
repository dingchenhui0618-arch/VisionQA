"use client";

import { useState } from "react";
import "./internal.css";

export function InternalBetaConsole() {
  const [label, setLabel] = useState("客户内测");
  const [inviteUrl, setInviteUrl] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createInvite() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/internal/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, role: "customer", initial_credits: 5, valid_days: 7 }),
      });
      const payload = await response.json();
      if (!response.ok) throw payload.error;
      setInviteUrl(payload.invite_url);
      setMessage("已生成一次性邀请，有效期 7 天，首次进入赠送 5 次额度。");
    } catch (error) {
      setMessage(error && typeof error === "object" && "message" in error ? String(error.message) : "邀请没有生成成功。");
    } finally {
      setBusy(false);
    }
  }

  async function grantCredit() {
    if (!tenantId.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/internal/credits/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId.trim(), amount: 1, reason: "质量申诉补回" }),
      });
      const payload = await response.json();
      if (!response.ok) throw payload.error;
      setMessage(`已补回 1 次，当前可用 ${payload.balance.available} 次。原因已写入额度流水。`);
    } catch (error) {
      setMessage(error && typeof error === "object" && "message" in error ? String(error.message) : "额度没有补发成功。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="internal-beta-console" aria-labelledby="internal-beta-title">
      <div className="internal-beta-console__head">
        <div><span>客户内测控制台</span><h1 id="internal-beta-title">邀请、额度与上线硬停</h1></div>
        <div className="internal-beta-console__status"><i />支付关闭 · 自动放行关闭</div>
      </div>
      <div className="internal-beta-console__grid">
        <div>
          <strong>创建客户邀请</strong>
          <p>一次消费，7 天有效，首次进入赠送 5 次内测额度。</p>
          <div className="internal-beta-console__controls">
            <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="邀请标签" maxLength={80} />
            <button type="button" onClick={createInvite} disabled={busy}>生成邀请</button>
          </div>
          {inviteUrl ? <input className="internal-beta-console__output" value={inviteUrl} readOnly aria-label="新邀请链接" /> : null}
        </div>
        <div>
          <strong>质量申诉补次</strong>
          <p>只补回 1 次，并把租户、操作者和原因写入额度流水。</p>
          <div className="internal-beta-console__controls">
            <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="tenantId" aria-label="客户租户 ID" />
            <button type="button" onClick={grantCredit} disabled={busy || !tenantId.trim()}>补回 1 次</button>
          </div>
        </div>
        <div className="internal-beta-console__limits">
          <strong>预算硬停</strong>
          <p>上线前 QA：最多 30 次 / 30 元。客户内测：累计 100 元。任一达到即停止新筛查和修图，已有项目仍可查看下载。</p>
        </div>
      </div>
      {message ? <p className="internal-beta-console__message" role="status">{message}</p> : null}
    </section>
  );
}
