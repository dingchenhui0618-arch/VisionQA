/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import "./landing.css";

const FLOW = [
  {
    no: "01",
    title: "批量找问题",
    copy: "同一 SKU 上传最多 10 张候选图。先免费筛出需要处理的图片，不再逐张盲看。",
  },
  {
    no: "02",
    title: "只修需要修的",
    copy: "确认最重要的问题和区域后再发起修正。开始前会明确告诉你是否消耗额度。",
  },
  {
    no: "03",
    title: "对比确认再下载",
    copy: "修正成功后先看前后对比，再确认商品、人物和非目标区域是否可用。",
  },
] as const;

export default function Landing() {
  return (
    <main className="customer-landing">
      <header className="customer-landing__nav">
        <Link href="/" className="customer-landing__brand" aria-label="VisionQA 首页">
          VisionQA
        </Link>
        <span className="customer-landing__beta">邀请制内测</span>
      </header>

      <section className="customer-landing__hero" aria-labelledby="hero-title">
        <div className="customer-landing__promise">
          <p className="customer-landing__eyebrow">服饰电商商品图检查与修正</p>
          <h1 id="hero-title">先找出真正需要返工的图。</h1>
          <p className="customer-landing__lede">
            一个 SKU 最多检查 10 张候选图。筛查免费，只有修正版成功返回并通过基础检查后，才扣 1 次内测额度。
          </p>
          <a className="customer-landing__primary" href="/login">
            接受邀请进入内测 <span aria-hidden>→</span>
          </a>
          <p className="customer-landing__trust">不自动扣费 · 技术失败不扣额度 · 图片默认 7 天删除</p>
        </div>

        <div className="customer-landing__proof" aria-label="示例修正前后对比">
          <div className="customer-landing__proof-head">
            <div>
              <span className="customer-landing__proof-label">示例 SKU</span>
              <strong>灰色针织开衫</strong>
            </div>
            <span className="customer-landing__status"><i aria-hidden /> 已完成修正</span>
          </div>
          <div className="customer-landing__comparison">
            <figure>
              <img src="/fashion/demo-cardigan-defect.png" alt="修正前的灰色针织开衫模特图" />
              <figcaption>修正前 · 袖口结构异常</figcaption>
            </figure>
            <figure>
              <img src="/fashion/demo-cardigan-repaired.png" alt="修正后的灰色针织开衫模特图" />
              <figcaption>修正后 · 等待人工确认</figcaption>
            </figure>
          </div>
          <p className="customer-landing__evidence-note">内部示例，仅用于说明操作过程，不代表客户采用或模型准确率。</p>
        </div>
      </section>

      <section className="customer-landing__flow" aria-labelledby="flow-title">
        <div className="customer-landing__section-copy">
          <p className="customer-landing__eyebrow">一次任务，只做三件事</p>
          <h2 id="flow-title">从 10 张候选里，拿到一张能继续使用的修正版。</h2>
        </div>
        <ol>
          {FLOW.map((step) => (
            <li key={step.no}>
              <span>{step.no}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="customer-landing__closing">
        <div>
          <p className="customer-landing__eyebrow">当前内测规则</p>
          <h2>每位受邀客户先获得 5 次修图额度。</h2>
        </div>
        <a className="customer-landing__primary" href="/login">
          开始第一个批次 <span aria-hidden>→</span>
        </a>
      </section>

      <footer className="customer-landing__footer">
        <span>VisionQA</span>
        <span>筛查免费，成功修正后扣次</span>
      </footer>
    </main>
  );
}
