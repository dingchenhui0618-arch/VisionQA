"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./landing.css";

const SKILLS = [
  {
    no: "01",
    title: "商品真值",
    en: "Product Truth",
    desc: "以白底图、官方确认稿和关键细节作为颜色、版型、图案与 Logo 的唯一依据。",
    output: "REFERENCE LOCK",
    emphasis: false,
  },
  {
    no: "02",
    title: "问题诊断",
    en: "Diagnosis",
    desc: "定位商品漂移、人体异常、遮挡、材质失真和非目标区域变化，不因缺少促销文字误判。",
    output: "EVIDENCE MAP",
    emphasis: false,
  },
  {
    no: "03",
    title: "局部修正",
    en: "Repair",
    desc: "把可修问题交给图像编辑模型；涉及商品身份或整体结构错误时，明确建议重新生成。",
    output: "REPAIR JOB",
    emphasis: false,
  },
  {
    no: "04",
    title: "复验与 4K",
    en: "Delivery",
    desc: "对比修改前后并检查非目标漂移；人工确认后生成本机 4K 尺寸文件与处理凭证。",
    output: "HUMAN APPROVED",
    emphasis: true,
  },
] as const;

export default function Landing() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<{
    state: "checking" | "ready" | "setup-required";
    model: string;
    batchLimit: number;
  }>({ state: "checking", model: "—", batchLimit: 3 });

  useEffect(() => {
    const root = cardsRef.current;
    if (!root) return;
    const cards = root.querySelectorAll<HTMLElement>(".landing-card");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/live-evaluate", {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("capability unavailable");
        return response.json() as Promise<{
          configured: boolean;
          model_snapshot: string;
          max_total_requests: number;
        }>;
      })
      .then((capability) => {
        setEngine({
          state: capability.configured ? "ready" : "setup-required",
          model: capability.configured
            ? capability.model_snapshot.toUpperCase()
            : "—",
          batchLimit: Math.min(3, capability.max_total_requests || 3),
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEngine({ state: "setup-required", model: "—", batchLimit: 3 });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary">
        {/* Native navigation is kept for the verified production runtime. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="landing-nav-left" aria-label="VisionQA 首页">
          <span className="landing-brand">VisionQA</span>
        </a>
        <a href="/login" className="landing-nav-right">
          <span>进入 VisionQA</span>
          <span aria-hidden>→</span>
        </a>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-light">
          <div className="landing-hero-spacer" aria-hidden />
          <h1 className="landing-title">VisionQA</h1>
          <p className="landing-title-sub">服饰电商 AI 模特图修正与交付</p>
          <p className="landing-lede">
            以真实商品白底图为依据，
            <br />
            定位并修正 AI 模特图中的商品漂移、人体异常与非目标变化。
          </p>
          <div className="landing-hero-spacer" aria-hidden />
          <div className="landing-cta-row">
            <a href="/login" className="landing-cta">
              <span>进入 VisionQA</span>
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>

        <div className="landing-hero-dark">
          <div className="landing-grid" aria-hidden />
          <div className="landing-reticle" aria-hidden>
            <span className="landing-reticle-ring r1" />
            <span className="landing-reticle-ring r2" />
            <span className="landing-reticle-ring r3" />
            <span className="landing-reticle-cross" />
            <span className="landing-reticle-dot" />
          </div>
          <div className="landing-readout" role="status" aria-live="polite">
            <div>
              <span className={`landing-readout-dot is-${engine.state}`} /> VISION ENGINE · {engine.state === "ready" ? "READY" : engine.state === "checking" ? "CHECKING" : "SETUP REQUIRED"}
            </div>
            <div>
              MODEL <b>{engine.model}</b>
            </div>
            <div>
              MODE <b>REPAIR COPILOT</b> · HUMAN REVIEW <b>ON</b>
            </div>
            <div>
              TASK <b>{engine.batchLimit} IMAGES MAX</b> · PROJECT <b>LOCAL</b>
            </div>
          </div>
          <div className="landing-scanline" aria-hidden />
        </div>
      </section>

      <section id="skills" className="landing-skills" ref={cardsRef}>
        <div className="landing-section-head">
          <div className="landing-kicker">
            <span className="landing-dot" aria-hidden /> 02 — 修正链路
          </div>
          <h2 className="landing-h2">先修好母图，再进入详情与促销排版</h2>
          <p className="landing-section-sub">
            评分只用于内部诊断。工作台围绕一张模特草图完成商品对照、问题定位、局部修正、前后复验和 4K 文件交付。
          </p>
        </div>
        <div className="landing-cards">
          {SKILLS.map((s, i) => (
            <article
              key={s.no}
              className={`landing-card${s.emphasis ? " is-emphasis" : ""}`}
              style={{ "--i": i } as CSSProperties}
            >
              <div className="landing-card-no">{s.no}</div>
              <div className="landing-card-body">
                <div className="landing-card-en">{s.en}</div>
                <h3 className="landing-card-title">{s.title}</h3>
                <p className="landing-card-desc">{s.desc}</p>
              </div>
              <div className="landing-card-foot">
                <span>{s.output}</span>
                <span aria-hidden>→</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-statement">
        <div className="landing-kicker landing-kicker-center">
          <span className="landing-dot" aria-hidden /> 03 — A FEW WORDS
        </div>
        <blockquote className="landing-quote">
          AI 模特图真正昂贵的部分，
          <br />
          不是生成，而是返工。
          <span>
            VisionQA 让每一次修正 <em>有依据</em>。
          </span>
        </blockquote>
      </section>

      <section className="landing-cta-section">
        <div className="landing-cta-strip">
          <div>
            <div className="landing-kicker">
              <span className="landing-dot" aria-hidden /> 04 — ENTER
            </div>
            <h2 className="landing-h2">进入工作台</h2>
          </div>
          <a href="/login" className="landing-cta landing-cta-lg">
            <span>打开 VisionQA</span>
            <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <span>VisionQA · AI 模特图修正</span>
        <span className="landing-foot-sep">·</span>
        <span>商品真值、修正复验与 4K 交付</span>
        <span className="landing-foot-sep">·</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
