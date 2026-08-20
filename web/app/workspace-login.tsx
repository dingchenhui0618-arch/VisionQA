"use client";

import { useState, type FormEvent } from "react";

type WorkspaceLoginProps = {
  onEnterPreview: () => void;
};

export function WorkspaceLogin({ onEnterPreview }: WorkspaceLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(
      email.trim() && password
        ? "正式账户认证尚未接入。当前页面不会验证或保存密码，请使用内部预览入口。"
        : "请输入邮箱和密码。",
    );
  };

  return (
    <main className="workspace-login-shell">
      <section className="login-brand-panel" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-label="VisionQA">
          <span>VQ</span>
          <strong>VisionQA</strong>
        </div>
        <div className="login-statement">
          <p>服饰电商内容交付工作台</p>
          <h1 id="login-title">从商品事实，到改图复审与营销交付。</h1>
          <ol aria-label="工作流程">
            <li><span>01</span>建立商品基准</li>
            <li><span>02</span>提交待评审素材</li>
            <li><span>03</span>完成质量评审</li>
            <li><span>04</span>改图并重新复审</li>
            <li><span>05</span>生成营销交付</li>
          </ol>
        </div>
        <p className="login-governance">自动放行关闭 · 所有正式结果必须人工终审</p>
      </section>

      <section className="login-form-panel" aria-label="登录 VisionQA">
        <div className="login-form-wrap">
          <div className="login-form-heading">
            <span>账户入口</span>
            <h2>登录工作台</h2>
            <p>管理商品基准、评审批次和营销交付记录。</p>
          </div>

          <form onSubmit={handleLogin} noValidate>
            <label>
              <span>工作邮箱</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                placeholder="name@company.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="请输入密码"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="login-form-meta">
              <label>
                <input type="checkbox" />
                <span>保持登录</span>
              </label>
              <button type="button" onClick={() => setNotice("密码找回服务将在正式账户系统接入后开放。")}>忘记密码</button>
            </div>
            <button className="login-submit" type="submit">登录</button>
            {notice && <p className="login-notice" role="status">{notice}</p>}
          </form>

          <div className="preview-entry">
            <span>内部构造阶段</span>
            <p>正式账户认证尚未接入。当前入口不验证身份，也不会保存账号或密码。</p>
            <button type="button" onClick={onEnterPreview}>进入内部预览工作台</button>
          </div>
        </div>
      </section>
    </main>
  );
}
