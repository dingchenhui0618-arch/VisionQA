"use client";

import { useState, type FormEvent } from "react";
import type { TrialAccountSession } from "../lib/visionqa/trial-auth";

type WorkspaceLoginProps = {
  onAuthenticated: (account: TrialAccountSession) => void;
};

export function WorkspaceLogin({ onAuthenticated }: WorkspaceLoginProps) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/trial-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const payload = (await response.json()) as {
        authenticated?: boolean;
        account?: TrialAccountSession;
        error?: { message?: string };
      };
      if (!response.ok || !payload.authenticated || !payload.account) {
        setStatus("error");
        setMessage(payload.error?.message ?? "登录失败，请稍后再试。");
        return;
      }
      onAuthenticated(payload.account);
    } catch {
      setStatus("error");
      setMessage("暂时无法登录，请检查网络后重试。");
    }
  }

  return (
    <main className="workspace-login-shell">
      <section className="login-brand-panel" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-label="VisionQA">
          <span>VQ</span>
          <strong>VisionQA</strong>
        </div>
        <div className="login-statement">
          <p>服饰电商 AI 商品图修正</p>
          <h1 id="login-title">看清问题，修好再交付。</h1>
          <ol aria-label="试用流程">
            <li><span>1</span>选择商品真值和待修图片</li>
            <li><span>2</span>确认问题与修改边界</li>
            <li><span>3</span>对比结果并人工放行</li>
          </ol>
        </div>
        <p className="login-governance">人工终审始终开启</p>
      </section>

      <section className="login-form-panel" aria-label="试用 VisionQA">
        <div className="login-form-wrap trial-entry">
          <div className="login-form-heading">
            <span>受邀试用</span>
            <h2>登录 VisionQA</h2>
            <p>使用管理员发放的手机号和密码进入工作台。</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <label>
              <span>手机号</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                maxLength={11}
                value={phone}
                placeholder="请输入试用手机号"
                onChange={(event) => {
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 11));
                  if (status === "error") setStatus("idle");
                }}
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="请输入密码"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (status === "error") setStatus("idle");
                }}
              />
            </label>
            {message && <p className="login-notice" role="alert">{message}</p>}
            <button
              className="login-submit"
              type="submit"
              disabled={status === "submitting"}
            >
              {status === "submitting" ? "正在登录…" : "登录并开始试用"}
            </button>
          </form>

          <ul className="trial-assurances" aria-label="试用说明">
            <li><strong>固定账号</strong><span>当前不开放注册和手机号验证</span></li>
            <li><strong>独立项目</strong><span>两个试用账号的本机项目分开保存</span></li>
            <li><strong>人工确认</strong><span>系统不会自动放行图片</span></li>
          </ul>

          <p className="trial-boundary">这是受控试用账号体系，不等同于正式客户认证。</p>
        </div>
      </section>
    </main>
  );
}
