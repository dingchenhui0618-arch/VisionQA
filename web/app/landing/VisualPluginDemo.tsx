"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckListIcon,
  FileSearchIcon,
  GitPullRequestIcon,
} from "@hugeicons/core-free-icons";

type Role = "user" | "assistant";
type Issue = { index: string; title: string; detail: string };
type Message = { id: string; role: Role; text: string; issues?: Issue[] };

const VIEWS = [
  { id: "chat", label: "对话" },
  { id: "context", label: "上下文" },
  { id: "history", label: "版本" },
] as const;
type View = (typeof VIEWS)[number]["id"];

// DepthCard-style motion contract, kept from the previous iteration.
const MAX_ROTATION = 10;
const MAX_TRANSLATION = 10;
const HOVER_SCALE = 1.025;
const LERP = 0.09;

// AiChat3 streaming contract.
const CATCH_UP_MS = 180;
const FLOOR_CPS = 45;
const LIVE_ID = "a-live";

const CANNED_REPLY =
  "移动端 390px 会把标题挤成四行，主按钮也掉到第二屏。建议标题收到 44px/1.06，让按钮和首句同屏；确认后我写进宿主并补一张复验图。";

const REPLY_BY_KEYWORD: { match: RegExp; reply: string }[] = [
  {
    match: /首屏|层级|标题/,
    reply:
      "首屏我先看三件事：标题、主图、主按钮的权重顺序。现在标题 64px 和按钮 18px 的字重太接近，视线会先落到按钮上；另外 390px 的复验图缺失，移动端结论还不能下。",
  },
  {
    match: /证据|截图|复验/,
    reply:
      "证据都在当前上下文里：1440 × 900 的整页截图、首屏 spacing token、以及按钮的 hover 态。缺的是 390px 的整页截图，补上之后我才能确认移动端是否要压缩标题。",
  },
  {
    match: /改动|版本|diff/i,
    reply:
      "这次改动集中在首屏：标题字重降了一档、按钮从实心改成毛玻璃、正文行高从 1.6 提到 1.7。三处都只影响首屏，其他区块没有动。",
  },
];

function pickReply(prompt: string) {
  return (
    REPLY_BY_KEYWORD.find((item) => item.match.test(prompt))?.reply ??
    CANNED_REPLY
  );
}

const SUGGESTIONS: { icon: IconSvgElement; label: string }[] = [
  { icon: FileSearchIcon, label: "先看首屏层级" },
  { icon: CheckListIcon, label: "列出复验点" },
  { icon: GitPullRequestIcon, label: "看这次改动" },
];

const SEED_MESSAGES: Message[] = [
  { id: "u-1", role: "user", text: "先看首屏层级" },
  {
    id: "a-1",
    role: "assistant",
    text: "首屏还有两处需要先处理，处理完再做移动端复验。",
    issues: [
      {
        index: "01",
        title: "主标题与主按钮权重接近",
        detail: "标题 64px 与按钮 18px 的字重接近，视线会先落到按钮上。",
      },
      {
        index: "02",
        title: "移动端没有可复验的截图",
        detail: "当前上下文只提供了 1440 × 900，390px 结果缺失。",
      },
    ],
  },
  { id: "u-2", role: "user", text: "标题必须保留 64px" },
  {
    id: "a-2",
    role: "assistant",
    text: "可以保留 64px，我把主按钮降一档权重。",
  },
  { id: "u-3", role: "user", text: "那移动端呢？" },
  { id: LIVE_ID, role: "assistant", text: CANNED_REPLY },
];

function lastWordBoundary(source: string, cut: number) {
  if (cut >= source.length) return source.length;
  const i = source.lastIndexOf(" ", cut);
  return i === -1 ? 0 : i;
}

function useSmoothedText() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const targetRef = useRef("");
  const shownRef = useRef(0);
  const endedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const target = targetRef.current;
      const behind = target.length - shownRef.current;
      if (behind > 0) {
        shownRef.current = reduceMotion
          ? target.length
          : Math.min(
              target.length,
              shownRef.current +
                behind * (1 - Math.exp(-dt / CATCH_UP_MS)) +
                (FLOOR_CPS * dt) / 1000,
            );
        const cut = Math.floor(shownRef.current);
        const finished = endedRef.current && cut >= target.length;
        const safe = finished ? target.length : lastWordBoundary(target, cut);
        setText(target.slice(0, safe));
        if (finished) setDone(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const push = useCallback((chunk: string) => {
    targetRef.current += chunk;
  }, []);
  const end = useCallback(() => {
    endedRef.current = true;
  }, []);
  const reset = useCallback(() => {
    targetRef.current = "";
    shownRef.current = 0;
    endedRef.current = false;
    setText("");
    setDone(false);
  }, []);
  return { text, done, push, end, reset };
}

function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setEdges({
      start: scrollTop > 1,
      end: Math.ceil(scrollTop + clientHeight) < scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  return { ref, edges, onScroll: update };
}

function useStickToBottom(scrollRef: { current: HTMLDivElement | null }) {
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      const overflowing = el.scrollHeight - el.clientHeight > 1;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = !overflowing || distance < 24;
      stickRef.current = atBottom;
      setShowJump(overflowing && !atBottom);
    };

    const onIntent = (e: WheelEvent | TouchEvent) => {
      const up = "deltaY" in e ? e.deltaY < 0 : true;
      if (!up) return;
      if (el.scrollHeight - el.clientHeight > 1 && el.scrollTop > 0) {
        stickRef.current = false;
      }
    };

    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
      sync();
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    el.addEventListener("wheel", onIntent, { passive: true });
    el.addEventListener("touchmove", onIntent, { passive: true });
    el.addEventListener("scroll", sync, { passive: true });

    el.scrollTop = el.scrollHeight;
    sync();
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onIntent);
      el.removeEventListener("touchmove", onIntent);
      el.removeEventListener("scroll", sync);
    };
  }, [scrollRef]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  return { showJump, jumpToLatest };
}

export default function VisualPluginDemo() {
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [liveId, setLiveId] = useState<string | null>(LIVE_ID);
  const [stopped, setStopped] = useState(false);
  const [value, setValue] = useState("");
  const [streamSource, setStreamSource] = useState(CANNED_REPLY);
  const [runId, setRunId] = useState(0);

  const { text: streamText, done, push, end, reset } = useSmoothedText();
  const {
    ref: transcriptRef,
    edges: transcriptEdges,
    onScroll: onTranscriptScroll,
  } = useScrollFade<HTMLDivElement>();
  const { showJump, jumpToLatest } = useStickToBottom(transcriptRef);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const transportRef = useRef<number | null>(null);

  const streaming = liveId !== null && !done && !stopped;
  const pending = streaming && streamText === "";
  const busy = view === "chat" && streaming;
  const statusLabel =
    view !== "chat"
      ? "只读"
      : streaming
        ? pending
          ? "思考中"
          : "输出中"
        : stopped
          ? "已停止"
          : "就绪";

  // Tilt + spotlight, driven by the same lerp loop as DepthCard.
  const cardRef = useRef<HTMLElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef({ x: 0, y: 0, rotateX: 0, rotateY: 0, scale: 1 });
  const currentRef = useRef({ x: 0, y: 0, rotateX: 0, rotateY: 0, scale: 1 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lerp = (start: number, end: number, factor: number) =>
      start + (end - start) * factor;
    let raf = 0;
    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      current.x = lerp(current.x, target.x, LERP);
      current.y = lerp(current.y, target.y, LERP);
      current.rotateX = lerp(current.rotateX, target.rotateX, LERP);
      current.rotateY = lerp(current.rotateY, target.rotateY, LERP);
      current.scale = lerp(current.scale, target.scale, LERP);
      const element = cardRef.current;
      if (element) {
        element.style.transform =
          "perspective(1400px) translate3d(calc(-50% + " +
          current.x +
          "px), calc(-50% + " +
          current.y +
          "px), 0) rotateX(" +
          current.rotateX +
          "deg) rotateY(" +
          current.rotateY +
          "deg) scale(" +
          current.scale +
          ")";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (spotlightRef.current) {
      spotlightRef.current.style.background =
        "radial-gradient(460px circle at " +
        x +
        "px " +
        y +
        "px, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.08) 42%, transparent 100%)";
      spotlightRef.current.style.opacity = "1";
    }
    const percentX = (x - rect.width / 2) / (rect.width / 2);
    const percentY = (y - rect.height / 2) / (rect.height / 2);
    targetRef.current = {
      x: percentX * -MAX_TRANSLATION,
      y: percentY * -MAX_TRANSLATION,
      rotateX: percentY * -MAX_ROTATION,
      rotateY: percentX * MAX_ROTATION,
      scale: HOVER_SCALE,
    };
  }

  function handlePointerLeave() {
    targetRef.current = { x: 0, y: 0, rotateX: 0, rotateY: 0, scale: 1 };
    if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
  }

  useEffect(() => {
    if (!liveId) return;
    if (reduced) {
      push(streamSource);
      end();
      return;
    }
    const chunks = streamSource.match(/\S+\s*/g) ?? [];
    let i = 0;
    transportRef.current = window.setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 3);
      push(chunks.slice(i, i + n).join(""));
      i += n;
      if (i >= chunks.length) {
        end();
        if (transportRef.current) window.clearInterval(transportRef.current);
        transportRef.current = null;
      }
    }, 120);
    return () => {
      if (transportRef.current) window.clearInterval(transportRef.current);
    };
  }, [liveId, runId, reduced, streamSource, push, end]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleSend = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const uid = "u-" + Date.now();
      const aid = "a-" + Date.now();
      const reply = pickReply(text);
      reset();
      setStopped(false);
      setStreamSource(reply);
      setMessages((m) => [
        ...m,
        { id: uid, role: "user", text },
        { id: aid, role: "assistant", text: reply },
      ]);
      setLiveId(aid);
      setRunId((n) => n + 1);
      setValue("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    },
    [reset],
  );

  const handleStop = useCallback(() => {
    if (transportRef.current) {
      window.clearInterval(transportRef.current);
      transportRef.current = null;
    }
    end();
    setStopped(true);
  }, [end]);

  return (
    <section
      ref={cardRef}
      className="plugin-window"
      style={{ transform: "perspective(1400px) translate3d(-50%, -50%, 0)" }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-label="VisionQA 浮动插件"
    >
      <div
        ref={spotlightRef}
        className="plugin-window-spotlight"
        aria-hidden="true"
      />

      <div className="plugin-window-bar">
        <div className="plugin-window-title">
          <span className="plugin-window-traffic">
            <i />
            <i />
            <i />
          </span>
          <strong>VisionQA</strong>
          <small>视觉判断</small>
        </div>
        <span
          role="status"
          className={busy ? "plugin-window-status is-busy" : "plugin-window-status"}
        >
          <i aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <div className="plugin-window-tabs" role="tablist" aria-label="插件视图">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "is-active" : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="plugin-window-context">
        <span className="plugin-window-context-mark">WEB</span>
        <div>
          <small>当前产物</small>
          <strong>官网首页 · 1440 × 900</strong>
        </div>
        <span className="plugin-window-context-status">待确认</span>
      </div>

      {view === "chat" ? (
        <>
      <div className="plugin-window-transcript-wrap">
        <div
          ref={transcriptRef}
          onScroll={onTranscriptScroll}
          className="plugin-window-transcript"
        >
          <div className="plugin-window-thread">
            {messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div key={message.id} className="plugin-window-msg is-user">
                    <div className="plugin-window-bubble">{message.text}</div>
                  </div>
                );
              }
              const isLive = message.id === liveId;
              const typing = isLive && streaming;
              return (
                <div key={message.id} className="plugin-window-msg is-assistant">
                  {typing && pending ? (
                    <div className="plugin-window-thinking">
                      <span className="plugin-window-arc" aria-hidden="true" />
                      正在判断…
                    </div>
                  ) : (
                    <p className="plugin-window-prose">
                      {typing ? streamText : message.text}
                    </p>
                  )}
                  {message.issues ? (
                    <div className="plugin-window-issues">
                      {message.issues.map((issue) => (
                        <div key={issue.index} className="plugin-window-issue">
                          <span>{issue.index}</span>
                          <div>
                            <strong>{issue.title}</strong>
                            <small>{issue.detail}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div
          aria-hidden="true"
          className={
            "plugin-window-fade" + (transcriptEdges.start ? " is-visible" : "")
          }
        />
        <div
          aria-hidden="true"
          className={
            "plugin-window-fade is-bottom" +
            (transcriptEdges.end ? " is-visible" : "")
          }
        />

        {showJump ? (
          <div className="plugin-window-jump-wrap">
            <motion.button
              type="button"
              onClick={jumpToLatest}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="plugin-window-jump"
            >
              <HugeiconsIcon
                icon={ArrowDown02Icon}
                size={13}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              最新
            </motion.button>
          </div>
        ) : null}
      </div>

      <div className="plugin-window-prompt-row" aria-label="建议提问">
        {SUGGESTIONS.map(({ icon, label }) => (
          <button key={label} type="button" onClick={() => handleSend(label)}>
            <HugeiconsIcon
              icon={icon}
              size={13}
              strokeWidth={1.9}
              aria-hidden="true"
            />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="plugin-window-composer">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autosize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(value);
            }
          }}
          placeholder="告诉 VisionQA 你想保留什么…"
          aria-label="输入消息"
          className="plugin-window-composer-input"
        />
        {streaming ? (
          <button
            type="button"
            onClick={handleStop}
            aria-label="停止生成"
            className="plugin-window-send is-stop"
          >
            <span className="plugin-window-stop-square" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSend(value)}
            aria-disabled={value.trim().length === 0}
            aria-label="发送"
            className="plugin-window-send"
          >
            <span className="plugin-window-send-label">send</span>
            <span className="plugin-window-send-arrow" aria-hidden="true">
              <HugeiconsIcon
                icon={ArrowUp02Icon}
                size={15}
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
          </button>
        )}
      </div>
        </>
      ) : null}

      {view === "context" ? (
        <>
        <div className="plugin-window-pane">
          <p className="plugin-window-kicker">VISIONQA 正在依据这些信息判断</p>
          <ul className="plugin-window-list">
            <li>
              <span>目标</span>
              <strong>品牌官网首页</strong>
            </li>
            <li>
              <span>受众</span>
              <strong>首次访问的消费者</strong>
            </li>
            <li>
              <span>保留</span>
              <strong>Logo、产品图、主标题</strong>
            </li>
            <li>
              <span>权限</span>
              <strong>只读，修改前需要确认</strong>
            </li>
          </ul>
          <div className="plugin-window-evidence">
            <div>
              <small>完整页面</small>
              <strong>1440 × 900</strong>
              <em>已就绪</em>
            </div>
            <div className="is-missing">
              <small>移动端</small>
              <strong>390 × 844</strong>
              <em>待补</em>
            </div>
          </div>
          <p className="plugin-window-footnote">
            只读访问，不含宿主源码；任何写入都需要你确认。
          </p>
        </div>
        <button
          type="button"
          className="plugin-window-pane-action"
          onClick={() => setView("chat")}
        >
          回到对话 →
        </button>
        </>
      ) : null}

      {view === "history" ? (
        <>
        <div className="plugin-window-pane">
          <p className="plugin-window-kicker">本次对话版本</p>
          <div className="plugin-window-history">
            <div className="is-current">
              <span>v1</span>
              <div>
                <strong>评审建议已生成</strong>
                <small>首屏权重 · 移动端复验 · 2 条建议</small>
                <em>尚未写入源文件</em>
              </div>
              <b>当前</b>
            </div>
            <div>
              <span>v0</span>
              <div>
                <strong>宿主初始产物</strong>
                <small>1440 × 900 整页截图</small>
                <em>可随时回滚</em>
              </div>
              <b>基线</b>
            </div>
          </div>

          <div className="plugin-window-diff">
            <p>写入后将改变</p>
            <ul>
              <li>
                <span>+</span>主按钮降一档权重
              </li>
              <li>
                <span>+</span>移动端标题收到 44px / 1.06
              </li>
              <li className="is-pending">
                <span>!</span>补一张 390px 复验图
              </li>
            </ul>
          </div>
          <p className="plugin-window-footnote">
            原始版本始终保留。写入动作需要宿主授权。
          </p>
        </div>
        <button
          type="button"
          className="plugin-window-pane-action"
          onClick={() => setView("chat")}
        >
          回到对话 →
        </button>
        </>
      ) : null}
    </section>
  );
}
