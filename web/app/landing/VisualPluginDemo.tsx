"use client";

import { useRef, useState, type PointerEvent } from "react";

type Tab = "review" | "context" | "history";

export default function VisualPluginDemo() {
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("review");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPosition({ x: drag.current.originX + event.clientX - drag.current.startX, y: drag.current.originY + event.clientY - drag.current.startY });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  if (!open) {
    return <button className="plugin-bubble" onClick={() => setOpen(true)} aria-label="打开 VisionQA 浮动插件">VQ<span /></button>;
  }

  return (
    <section
      className={`plugin-window${minimized ? " is-minimized" : ""}`}
      style={{ transform: `translate3d(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px), 0)` }}
      aria-label="VisionQA 浮动插件"
    >
      <div className="plugin-window-bar" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        <div className="plugin-window-title"><span className="plugin-window-dot" /> VisionQA <small>视觉判断</small></div>
        <div className="plugin-window-actions">
          <button onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "展开插件" : "最小化插件"}>{minimized ? "□" : "—"}</button>
          <button onClick={() => setOpen(false)} aria-label="关闭插件">×</button>
        </div>
      </div>
      {!minimized && <>
        <div className="plugin-window-tabs" role="tablist" aria-label="插件视图">
          {(["review", "context", "history"] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "review" ? "评审" : item === "context" ? "上下文" : "版本"}</button>)}
        </div>
        <div className="plugin-window-body">
          {tab === "review" && <>
            <p className="plugin-window-kicker">当前产物 · 官网首页 / 1440 × 900</p>
            <h3>我发现 2 个需要确认的视觉问题。</h3>
            <div className="plugin-window-issue"><span>01</span><div><strong>首屏层级不够明确</strong><small>标题、主图和主要动作的视觉权重接近。</small></div></div>
            <div className="plugin-window-issue"><span>02</span><div><strong>移动端需要重新复验</strong><small>当前上下文没有提供 390px 渲染结果。</small></div></div>
            <button className="plugin-window-primary" onClick={() => setTab("context")}>查看修正方案 <span aria-hidden="true">→</span></button>
          </>}
          {tab === "context" && <>
            <p className="plugin-window-kicker">我正在依据这些信息判断</p>
            <ul className="plugin-window-list"><li><span>目标</span><strong>品牌官网首页</strong></li><li><span>受众</span><strong>首次访问的消费者</strong></li><li><span>保留</span><strong>Logo、产品图、主标题</strong></li><li><span>权限</span><strong>只读，修改前需要确认</strong></li></ul>
            <button className="plugin-window-primary" onClick={() => setTab("review")}>回到问题列表 <span aria-hidden="true">↗</span></button>
          </>}
          {tab === "history" && <>
            <p className="plugin-window-kicker">本次对话版本</p>
            <div className="plugin-window-history"><span>v0</span><div><strong>宿主初始产物</strong><small>等待视觉评审</small></div></div>
            <div className="plugin-window-history is-current"><span>v1</span><div><strong>评审建议已生成</strong><small>尚未写入源文件</small></div></div>
            <p className="plugin-window-footnote">原始版本始终保留。写入动作需要宿主授权。</p>
          </>}
        </div>
        <div className="plugin-window-input"><span>告诉 VisionQA 你想保留什么…</span><button aria-label="发送">↑</button></div>
      </>}
    </section>
  );
}
