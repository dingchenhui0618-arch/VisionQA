"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { BetaSessionView, CreditBalance } from "../../lib/beta/contracts";
import "./customer.css";

export function CustomerShell({
  session,
  credits,
  children,
}: {
  session: BetaSessionView;
  credits: CreditBalance;
  children: ReactNode;
}) {
  async function logout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/beta-auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/");
  }

  return (
    <div className="customer-shell">
      <header className="customer-topbar">
        <Link href="/" className="customer-topbar__brand" aria-label="VisionQA 首页">VisionQA</Link>
        <nav aria-label="客户工作区">
          <a href="/workspace">项目</a>
          {session.role === "admin" || session.role === "developer" ? <a href="/internal">开发者版</a> : null}
        </nav>
        <div className="customer-topbar__account">
          <span className="customer-credit"><i aria-hidden />{credits.label} <strong>{credits.available}</strong></span>
          <span className="customer-account-name">{session.displayName}</span>
          <form onSubmit={logout}>
            <button type="submit">退出</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
