"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "./landing.css";

const SKILLS = [
  {
    no: "01",
    title: "真实感",
    en: "Realism",
    desc: "AI 真人图像中皮肤纹理、眼神光、发丝边缘的真实程度评估。",
    weight: "25%",
  },
  {
    no: "02",
    title: "摄影感",
    en: "Photography",
    desc: "光影逻辑、构图张力与镜头景深是否符合商业摄影语言。",
    weight: "20%",
  },
  {
    no: "03",
    title: "材质感",
    en: "Materiality",
    desc: "面料纹理、金属高光、玻璃透射等材质表达的可信度。",
    weight: "20%",
  },
  {
    no: "04",
    title: "商业价值",
    en: "Commercial Value",
    desc: "综合平台促销、渠道与人群语境，判定发布标准的最终评分。",
    weight: "35%",
    emphasis: true,
  },
] as const;

export default function Landing() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<{
    state: "checking" | "ready" | "setup-required";
    model: string;
    batchLimit: number;
  }>({ state: "checking", model: "—", batchLimit: 10 });

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
          batchLimit: capability.max_total_requests || 10,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEngine({ state: "setup-required", model: "—", batchLimit: 10 });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary">
        <Link href="/workspace" className="landing-nav-left">
          <span className="landing-brand">VisionQA</span>
        </Link>
        <Link href="/workspace" className="landing-nav-right">
          <span>进入 VisionQA</span>
          <span aria-hidden>→</span>
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-light">
          <div className="landing-hero-spacer" aria-hidden />
          <h1 className="landing-title">VisionQA</h1>
          <p className="landing-title-sub">面向未来的 AI 视觉质量评估</p>
          <p className="landing-lede">
            从真实感到商业价值，
            <br />
            一套为服饰电商而生的结构化评分、修复 Prompt 与人工发布门禁。
          </p>
          <div className="landing-hero-spacer" aria-hidden />
          <div className="landing-cta-row">
            <Link href="/workspace" className="landing-cta">
              <span>进入 VisionQA</span>
              <span aria-hidden>→</span>
            </Link>
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
              MODE <b>HUMAN REVIEW</b> · AUTO PASS <b>OFF</b>
            </div>
            <div>
              BATCH <b>{engine.batchLimit} MAX</b> · IMAGE STORE <b>NONE</b>
            </div>
          </div>
          <div className="landing-scanline" aria-hidden />
        </div>
      </section>

      <section id="skills" className="landing-skills" ref={cardsRef}>
        <div className="landing-section-head">
          <div className="landing-kicker">
            <span className="landing-dot" aria-hidden /> 02 — 四维评估
          </div>
          <h2 className="landing-h2">四个 Skills，从像素到发布</h2>
          <p className="landing-section-sub">
            每张图都经过真实感、摄影感、材质感与商业价值的逐项评估，并给出修复 Prompt 与人工复核建议。
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
                <span>权重 {s.weight}</span>
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
          未来电商的每一张主图，
          <br />
          都会经过 AI 的眼睛。
          <span>
            VisionQA 让这双眼睛 <em>有标准</em>。
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
          <Link href="/workspace" className="landing-cta landing-cta-lg">
            <span>打开 VisionQA</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>VisionQA · 视觉质量评估</span>
        <span className="landing-foot-sep">·</span>
        <span>视觉评估与人工审核基础设施</span>
        <span className="landing-foot-sep">·</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
