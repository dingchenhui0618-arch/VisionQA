"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type CollaborationStatus = "RUNNING" | "DONE" | "FAILED" | "WAITING";

export type CollaborationEvent = {
  id: string;
  roleLabel: string;
  summary: string;
  status: CollaborationStatus;
  createdAt: string;
  action?: { label: string };
};

type Position = { x: number; y: number };

const POSITION_KEY = "visionqa.collab.position";
const DESKTOP_COLLAPSED_KEY = "visionqa.collab.collapsed.desktop";
const MOBILE_COLLAPSED_KEY = "visionqa.collab.collapsed.mobile";

const STATUS_LABEL: Record<CollaborationStatus, string> = {
  RUNNING: "进行中",
  DONE: "已完成",
  FAILED: "未完成",
  WAITING: "等待你确认",
};

// Session storage is only written by this window, so there is nothing to subscribe to.
function subscribeToNothing() {
  return () => {};
}

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Remembering the position is a convenience; ignore storage failures.
  }
}

function serverSnapshot(): string | null {
  return null;
}

// On a phone the window is a bottom drawer, so it starts collapsed and never
// covers the main action. A person's own choice always wins over this default.
const NARROW_QUERY = "(max-width: 720px)";

function subscribeToNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

function narrowServerSnapshot(): boolean {
  return false;
}

export function CollaborationWindow({
  events,
  stageLabel,
  nextStep,
}: {
  events: CollaborationEvent[];
  stageLabel: string;
  nextStep: { title: string; body: string; actionLabel?: string };
}) {
  const storedPosition = useSyncExternalStore(subscribeToNothing, () => readStored(POSITION_KEY), serverSnapshot);
  const storedDesktopCollapsed = useSyncExternalStore(subscribeToNothing, () => readStored(DESKTOP_COLLAPSED_KEY), serverSnapshot);
  const storedMobileCollapsed = useSyncExternalStore(subscribeToNothing, () => readStored(MOBILE_COLLAPSED_KEY), serverSnapshot);
  const isNarrow = useSyncExternalStore(subscribeToNarrow, readNarrow, narrowServerSnapshot);

  // `undefined` means "no interaction yet, fall back to what the session remembered".
  const [positionOverride, setPositionOverride] = useState<Position | null | undefined>(undefined);
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | undefined>(undefined);
  const [lastSeen, setLastSeen] = useState(0);
  const [dragOrigin, setDragOrigin] = useState<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
    baseLeft: number;
    baseTop: number;
    width: number;
    height: number;
  } | null>(null);

  const rememberedPosition = useMemo(() => parsePosition(storedPosition), [storedPosition]);
  const position = positionOverride !== undefined ? positionOverride : rememberedPosition;
  const storedCollapsed = isNarrow ? storedMobileCollapsed : storedDesktopCollapsed;
  const collapsed = collapsedOverride !== undefined
    ? collapsedOverride
    : storedCollapsed !== null
      ? storedCollapsed === "1"
      : isNarrow;
  const unread = collapsed ? Math.max(0, events.length - lastSeen) : 0;

  function toggleCollapsed() {
    const next = !collapsed;
    setLastSeen(events.length);
    setCollapsedOverride(next);
    writeStored(isNarrow ? MOBILE_COLLAPSED_KEY : DESKTOP_COLLAPSED_KEY, next ? "1" : "0");
  }

  function resetPosition() {
    setPositionOverride(null);
    writeStored(POSITION_KEY, null);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const windowRect = event.currentTarget.closest<HTMLElement>(".customer-collab")?.getBoundingClientRect();
    if (!windowRect) return;
    const originX = position?.x ?? 0;
    const originY = position?.y ?? 0;
    setDragOrigin({
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX,
      originY,
      baseLeft: windowRect.left - originX,
      baseTop: windowRect.top - originY,
      width: windowRect.width,
      height: windowRect.height,
    });
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOrigin) return;
    const proposed = {
      x: dragOrigin.originX + (event.clientX - dragOrigin.pointerX),
      y: dragOrigin.originY + (event.clientY - dragOrigin.pointerY),
    };
    setPositionOverride(constrainPosition(proposed, dragOrigin));
  }

  function pointerUp() {
    if (dragOrigin && position) writeStored(POSITION_KEY, JSON.stringify(position));
    setDragOrigin(null);
  }

  function runNextStep() {
    const target = document.querySelector<HTMLElement>(
      ".customer-project__main .customer-primary:not([disabled]), .customer-project__main .customer-secondary",
    );
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus();
  }

  const moved = position !== null;

  return (
    <aside
      className={`customer-collab${collapsed ? " is-collapsed" : ""}${moved ? " is-moved" : ""}`}
      style={moved ? { transform: `translate(${position.x}px, ${position.y}px)` } : undefined}
      aria-label="智能体协作窗"
    >
      <div
        className="customer-collab__bar"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div className="customer-collab__title">
          <span className="customer-collab__mark" aria-hidden>VQ</span>
          <div>
            <small>智能体协作</small>
            <strong>{stageLabel}</strong>
          </div>
        </div>
        <div className="customer-collab__controls">
          {moved ? (
            <button type="button" className="customer-collab__ghost" onClick={resetPosition}>
              复位
            </button>
          ) : null}
          <button type="button" className="customer-collab__ghost" onClick={toggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? "展开" : "折叠"}
            {collapsed && unread > 0 ? <em aria-label={`${unread} 条新记录`}>{unread}</em> : null}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="customer-collab__body">
          <section className="customer-collab__next" aria-label="下一步">
            <strong>{nextStep.title}</strong>
            <p>{nextStep.body}</p>
            {nextStep.actionLabel ? (
              <button type="button" className="customer-collab__action" onClick={runNextStep}>
                {nextStep.actionLabel}
              </button>
            ) : null}
          </section>

          <section className="customer-collab__log" aria-label="协作记录" aria-live="polite">
            {events.length === 0 ? (
              <p className="customer-collab__empty">
                <strong>尚未开始</strong>
                建立批次并开始筛查后，这里会按真实进度记录每一步。
              </p>
            ) : (
              <ol>
                {events.map((event) => (
                  <li key={event.id} className={`is-${event.status.toLowerCase()}`}>
                    <div>
                      <span className="customer-collab__role">{event.roleLabel}</span>
                      <span className="customer-collab__status">{STATUS_LABEL[event.status]}</span>
                    </div>
                    <p>{event.summary}</p>
                    <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

function parsePosition(raw: string | null): Position | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // A malformed value just means the window opens at its default place.
  }
  return null;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function constrainPosition(
  proposed: Position,
  frame: { baseLeft: number; baseTop: number; width: number; height: number },
): Position {
  const margin = 8;
  const minX = margin - frame.baseLeft;
  const maxX = window.innerWidth - margin - frame.width - frame.baseLeft;
  const minY = margin - frame.baseTop;
  const maxY = window.innerHeight - margin - frame.height - frame.baseTop;
  return {
    x: Math.min(Math.max(minX, maxX), Math.max(minX, proposed.x)),
    y: Math.min(Math.max(minY, maxY), Math.max(minY, proposed.y)),
  };
}
