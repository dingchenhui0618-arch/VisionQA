"use client";

import { useEffect, useState } from "react";
import HexagonalVault from "./hexagonal-vault";
import VisualPluginDemo from "./VisualPluginDemo";
import "./plugin-landing.css";

const FLOW = [
  { no: "01", title: "读懂当前产物", body: "接收截图、图片、网页结构或演示页对象，并读取宿主智能体已经确认的目标和限制。" },
  { no: "02", title: "给出有证据的判断", body: "只指出会影响任务结果的视觉问题，标明位置、严重度、置信度和可复核证据。" },
  { no: "03", title: "修正后再复验", body: "用户批准后才生成修改；重新渲染并对比前后版本，保留原稿和每次修正轨迹。" },
] as const;

const ARTIFACTS = [
  ["WEB", "网页", "截图 + DOM / CSS"],
  ["SLIDE", "演示页", "渲染图 + 对象结构"],
  ["IMAGE", "视觉素材", "图片 + 参考 + 约束"],
] as const;

export default function Landing() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((response) => setReady(response.ok))
      .catch(() => setReady(false));
    return () => controller.abort();
  }, []);

  return (
    <main className="plugin-landing">
      <nav className="plugin-nav" aria-label="主导航">
        <div className="plugin-nav-left">
          <a className="plugin-brand" href="#top" aria-label="VisionQA 首页">
            <span>VisionQA</span>
          </a>
        </div>
        <div className="plugin-nav-right">
          <div className="plugin-nav-meta">
            <span className="plugin-nav-status"><i data-ready={ready === true} /> {ready === null ? "本地探针" : ready ? "本地可运行" : "等待宿主"}</span>
            <a href="#run">开发者入口</a>
          </div>
        </div>
      </nav>

      <section className="plugin-hero" id="top">
        <div className="plugin-hero-copy">
          <p className="plugin-eyebrow"><span /> VISUAL JUDGMENT PLUGIN · 0.1</p>
          <h1>让每个智能体，拥有一双能复盘的眼睛。</h1>
          <p className="plugin-hero-lede">
            VisionQA 读取宿主智能体正在制作的网页、演示页或视觉素材，结合任务上下文判断哪里影响结果，并给出可以执行、可以复验的修正方案。
          </p>
          <div className="plugin-hero-actions">
            <a className="plugin-button plugin-button-dark" href="#plugin">查看插件能力 <span aria-hidden="true">↓</span></a>
            <a className="plugin-button plugin-button-light" href="#run">本地运行方式 <span aria-hidden="true">→</span></a>
          </div>
          <p className="plugin-hero-note">开源协议与 Provider 由宿主决定。当前本地版本使用透明 Mock，不伪造真实视觉结论。</p>
        </div>
        <div className="plugin-hero-stage" aria-label="VisionQA 浮动插件演示">
          <HexagonalVault
            backgroundColor="#050505"
            colors={["#FFFFFF", "#FFFFFF"]}
            cellSize={1.35}
            lineWidth={0.45}
            litWidth={1.6}
            lattice={0.5}
            glow={1.7}
            glowRadius={1.1}
            trailLength={3.5}
            trailWidth={1.2}
            follow={0.8}
            speed={0.9}
            dpr={1.5}
          >
            <div className="plugin-stage-guides" aria-hidden="true">
              <span className="plugin-stage-crosshair plugin-stage-crosshair-x" />
              <span className="plugin-stage-crosshair plugin-stage-crosshair-y" />
              <span className="plugin-stage-corner plugin-stage-corner-tl" />
              <span className="plugin-stage-corner plugin-stage-corner-br" />
            </div>
            <div className="plugin-stage-label"><span>VISUAL FIELD</span><strong>HOST CONTEXT / READY TO REVIEW</strong></div>
            <VisualPluginDemo />
          </HexagonalVault>
        </div>
      </section>

      <section className="plugin-section plugin-intro" id="plugin">
        <div className="plugin-section-heading">
          <p className="plugin-eyebrow"><span /> 01 — THE PLUGIN</p>
          <h2>宿主智能体负责创造，VisionQA 负责把关。</h2>
          <p>它不替用户接管整个对话，也不把审美压缩成一个分数。它只在视觉产物出现时进入，拿到足够上下文后做判断，并把下一步说清楚。</p>
        </div>
        <div className="plugin-flow">
          {FLOW.map((item) => (
            <article key={item.no} className="plugin-flow-item">
              <span className="plugin-flow-no">{item.no}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="plugin-section plugin-context-section">
        <div className="plugin-section-heading plugin-section-heading-wide">
          <p className="plugin-eyebrow"><span /> 02 — CONTEXTUAL JUDGMENT</p>
          <h2>它判断的不是“好不好看”，而是“对这个任务能不能用”。</h2>
          <p>目标、受众、平台、品牌和必须保留项会进入同一次评审。信息不足时返回需要补充，不用模型的主观猜测冒充事实。</p>
        </div>
        <div className="plugin-artifact-grid">
          {ARTIFACTS.map(([code, title, detail]) => (
            <div className="plugin-artifact" key={code}>
              <span>{code}</span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="plugin-section plugin-contract-section">
        <div className="plugin-contract-copy">
          <p className="plugin-eyebrow"><span /> 03 — ONE CONTRACT</p>
          <h2>一个内核，适配不同智能体。</h2>
          <p>本地 CLI、MCP、浏览器侧边栏和宿主插件都使用同一份 VisualReview Contract。适配器只负责上下文、权限、渲染和写回。</p>
          <a className="plugin-inline-link" href="#run">查看本地接口 <span aria-hidden="true">↗</span></a>
        </div>
        <pre className="plugin-contract-code" aria-label="VisualReview Contract 示例"><code>{`{
  "operation": "review",
  "artifact": "web_page",
  "intent": "品牌官网首页",
  "permissions": {
    "can_write_source": false
  },
  "decision": "NEEDS_REVISION",
  "repair_plan": {
    "requires_approval": true
  }
}`}</code></pre>
      </section>

      <section className="plugin-section plugin-run-section" id="run">
        <div>
          <p className="plugin-eyebrow"><span /> 04 — RUN IT LOCALLY</p>
          <h2>先在本机验证，再接入你的智能体。</h2>
          <p>源码位于 <code>D:\\VisionQA\\web</code>。当前适配器默认使用 Mock Provider，清楚标记“未进行真实像素分析”；配置宿主 Provider 后再切换到真实调用。</p>
        </div>
        <div className="plugin-command-stack">
          <div><span>检查能力</span><code>npm run visual:capabilities</code></div>
          <div><span>校验请求</span><code>npm run visual:validate -- request.json</code></div>
          <div><span>启动 MCP</span><code>npm run visual:mcp</code></div>
        </div>
      </section>

      <footer className="plugin-footer">
        <span>VisionQA · Visual judgment plugin</span>
        <span>本地原型 · 证据优先 · 人工确认</span>
      </footer>
    </main>
  );
}
