"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export function MockLogin() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  async function enterAgent() {
    const response = await fetch("/api/local-agent/mock-session", { method: "POST" });
    if (!response.ok) throw new Error("本地智能体入口暂时不可用。");
    window.location.assign("/agent");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting"); setMessage("");
    try {
      const response = await fetch("/api/trial-auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, password }) });
      const payload = await response.json() as { authenticated?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.authenticated) throw new Error(payload.error?.message ?? "登录失败，请检查账号信息。");
      await enterAgent();
    } catch (cause) {
      setStatus("error"); setMessage(cause instanceof Error ? cause.message : "暂时无法登录，请稍后重试。");
    }
  }

  return <main className="workspace-login-shell">
    <section className="login-brand-panel" aria-labelledby="login-title">
      <Link className="login-brand-mark" href="/" aria-label="返回 VisionQA 首页"><span>VQ</span><strong>VisionQA</strong></Link>
      <div className="login-statement"><p>服饰电商 AI 商品图修正</p><h1 id="login-title">看清问题，修好再交付。</h1><ol aria-label="工作流程"><li><span>1</span>选择商品真值和待修图片</li><li><span>2</span>确认问题与修改边界</li><li><span>3</span>在对话中复验并交付</li></ol></div>
      <p className="login-governance">人工终审始终开启</p>
    </section>
    <section className="login-form-panel" aria-label="登录 VisionQA">
      <div className="login-form-wrap trial-entry">
        <div className="login-form-heading"><span>本地体验环境</span><h2>登录 VisionQA</h2><p>使用现有试用账号进入单商品智能体。</p></div>
        <form onSubmit={handleLogin} noValidate>
          <label><span>手机号</span><input type="tel" inputMode="numeric" autoComplete="username" maxLength={11} value={phone} placeholder="请输入试用手机号" onChange={event => { setPhone(event.target.value.replace(/\D/g, "").slice(0, 11)); if (status === "error") setStatus("idle"); }} /></label>
          <label><span>密码</span><input type="password" autoComplete="current-password" value={password} placeholder="请输入密码" onChange={event => { setPassword(event.target.value); if (status === "error") setStatus("idle"); }} /></label>
          {message && <p className="login-notice" role="alert">{message}</p>}
          <button className="login-submit" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "正在进入…" : "登录并进入智能体"}</button>
        </form>
        <div className="login-test-entry"><div><strong>测试体验入口</strong><span>跳过账号验证，进入完全模拟流程</span></div><form action="/api/local-agent/mock-session" method="post"><button className="login-test-button" type="submit">直接体验 Mock</button></form></div>
        <p className="trial-boundary">账号登录复用原试用认证；Mock 入口不代表真实身份、模型结果或额度。</p>
      </div>
    </section>
  </main>;
}
