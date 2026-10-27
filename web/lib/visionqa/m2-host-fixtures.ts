import {
  codeReviewV01ResponseSchema,
  parseCodeReviewV01Request,
  parseVisualReviewV02Request,
  visualReviewV02ResponseSchema,
  type CodeReviewV01Request,
  type CodeReviewV01Response,
  type EvidenceAnchor,
  type VisualReviewV02Request,
  type VisualReviewV02Response,
} from "./review-contract-v0.2.ts";
import { hostCaptureSchema, parseHostCapture, type HostCapture } from "./host-adapter-contract.ts";

/**
 * Small, deterministic M2 fixtures. They intentionally use local refs rather
 * than files or network URLs so the Mock runtime can exercise the same
 * contracts without reading customer data or calling a Provider.
 */
// A valid 1x1 PNG keeps the fixture safe for adapters that perform a decode
// check while remaining tiny and free of customer content.
const fixtureImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const fixtureHost = { type: "fixture-host", adapter_version: "0.2.0" } as const;

const visualProfile = { id: "visual-baseline", version: "0.1.0", kind: "builtin" } as const;
const codeProfile = { id: "code-quality", version: "0.1.0", kind: "builtin" } as const;
const linkedProfile = { id: "linked-review", version: "0.1.0", kind: "builtin" } as const;

export type M2CodeHostFixture = {
  readonly host: typeof fixtureHost;
  readonly source: {
    readonly file: string;
    readonly language: string;
    readonly source: string;
    readonly ast: { readonly type: string; readonly selector: string };
    readonly diff: string;
  };
};

export type M2LinkedHostFixture = {
  readonly capture: HostCapture;
  readonly source: M2CodeHostFixture["source"];
};

export type OfflineMockFlow =
  | { readonly kind: "visual"; readonly host: HostCapture; readonly request: VisualReviewV02Request; readonly response: VisualReviewV02Response }
  | { readonly kind: "code"; readonly host: M2CodeHostFixture; readonly request: CodeReviewV01Request; readonly response: CodeReviewV01Response }
  | { readonly kind: "linked"; readonly host: M2LinkedHostFixture; readonly request: VisualReviewV02Request; readonly response: VisualReviewV02Response };

export function createVisualHostFixture(): HostCapture {
  return parseHostCapture({
    schema_version: "visionqa-host-capture-v0.1",
    capture_id: "m2-visual-capture",
    conversation_id: "m2-visual-conversation",
    host: { type: "chrome-extension", adapter_version: "0.2.0" },
    page: {
      url: "https://fixture.visionqa.local/review/visual",
      title: "VisionQA 视觉评审 Fixture",
      viewport: { width: 1440, height: 900, device_scale_factor: 1 },
    },
    dom: {
      text: "主标题 视觉评审 当前状态 查看建议",
      headings: ["视觉评审", "当前状态"],
      landmarks: ["main", "nav", "complementary"],
      interactive_summary: "按钮：查看建议；标签：评审、上下文、版本",
    },
    conversation: [{ role: "user", content: "检查首屏层级和主要动作是否清楚。" }],
    intent: {
      goal: "确认当前视觉产物的层级、可读性和主要动作是否清楚。",
      audience: "首次访问的用户",
      must_keep: ["品牌标识", "主要操作入口"],
    },
    images: [{ role: "candidate", name: "visible-tab.png", mime_type: "image/png", data_url: fixtureImage }],
    permissions: { can_call_model: true, can_read_source: false, can_write_source: false },
  });
}

export function createCodeHostFixture(): M2CodeHostFixture {
  return {
    host: fixtureHost,
    source: {
      file: "src/components/ReviewPanel.tsx",
      language: "tsx",
      source: "export function ReviewPanel() { return <button>查看建议</button>; }",
      ast: { type: "jsx", selector: "ReviewPanel > button" },
      diff: "@@ -1,1 +1,1 @@\n-export function ReviewPanel() {}\n+export function ReviewPanel() { return <button>查看建议</button>; }",
    },
  };
}

export function createLinkedHostFixture(): M2LinkedHostFixture {
  const capture = createVisualHostFixture();
  return {
    capture: {
      ...capture,
      permissions: { ...capture.permissions, can_read_source: true },
    },
    source: createCodeHostFixture().source,
  };
}

/** Convert an existing Host Capture into the new v0.2 visual request without
 * changing the v0.1 compatibility converter. */
export function hostCaptureToVisualReviewV02Request(
  capture: HostCapture,
  options: { readonly linked?: boolean; readonly sourceSummary?: string } = {},
): VisualReviewV02Request {
  const candidate = capture.images.find((image) => image.role === "candidate");
  return parseVisualReviewV02Request({
    schema_version: "visual-review-v0.2",
    request_id: capture.capture_id,
    conversation_id: capture.conversation_id,
    host: { type: capture.host.type, adapter_version: capture.host.adapter_version },
    artifact: {
      type: "web_page",
      role: "primary",
      name: capture.page.title || capture.page.url,
      mime_type: candidate?.mime_type,
      screenshot_ref: candidate ? "host://current-visible-tab" : undefined,
      structure_ref: "host://dom-summary",
      viewport: capture.page.viewport,
      evidence_anchors: [{
        id: "fixture-hero",
        kind: "dom_selector",
        selector: "main h1",
        description: "页面主标题，用于视觉层级观察",
      }],
    },
    intent: {
      goal: capture.intent.goal,
      audience: capture.intent.audience,
      platform: "fixture-host",
    },
    constraints: capture.intent.must_keep.length ? { must_keep: capture.intent.must_keep } : undefined,
    profile: options.linked ? linkedProfile : visualProfile,
    review_mode: options.linked ? "linked" : "visual",
    context: {
      conversation: capture.conversation,
      dom_summary: [capture.dom.text, capture.dom.headings.join(" / "), capture.dom.interactive_summary].filter(Boolean).join("\n"),
      source_summary: options.sourceSummary,
    },
    permissions: {
      can_read_source: capture.permissions.can_read_source && Boolean(options.sourceSummary),
      can_write_source: false,
      can_call_model: capture.permissions.can_call_model,
      can_render: false,
      can_run_commands: false,
    },
    operation: "review",
  });
}

export function createCodeReviewFixture(): CodeReviewV01Request {
  const fixture = createCodeHostFixture();
  return parseCodeReviewV01Request({
    schema_version: "code-review-v0.1",
    request_id: "m2-code-review",
    conversation_id: "m2-code-conversation",
    host: fixture.host,
    target: "diff",
    source_artifacts: [{
      file: fixture.source.file,
      language: fixture.source.language,
      content_ref: "fixture://source/review-panel.tsx",
      diff_ref: "fixture://diff/review-panel.diff",
      ast_ref: "fixture://ast/review-panel.json",
    }],
    intent: { goal: "检查组件边界、可读性和无障碍风险。", platform: "fixture-host" },
    profile: codeProfile,
    context: {
      source_summary: `${fixture.source.file}\n${fixture.source.source}\nAST: ${fixture.source.ast.selector}`,
      conversation: [{ role: "user", content: "不要自动修改源码，只给出带行号的建议。" }],
    },
    permissions: { can_read_source: true, can_write_source: false, can_call_model: true, can_render: false, can_run_commands: false },
    operation: "review",
  });
}

export function createLinkedReviewFixture(): VisualReviewV02Request {
  const fixture = createLinkedHostFixture();
  return hostCaptureToVisualReviewV02Request(fixture.capture, {
    linked: true,
    sourceSummary: `${fixture.source.file}\n${fixture.source.source}\nAST: ${fixture.source.ast.selector}\nDiff: ${fixture.source.diff}`,
  });
}

const pixelEvidence: EvidenceAnchor = {
  id: "fixture-pixel-hero",
  kind: "pixel_bbox",
  rect: { x: 96, y: 120, width: 520, height: 180 },
  description: "首屏主标题和主要动作区域",
};

const domEvidence: EvidenceAnchor = {
  id: "fixture-dom-hero",
  kind: "dom_selector",
  selector: "main h1",
  rect: { x: 96, y: 120, width: 420, height: 76 },
  description: "页面主标题 DOM 元素",
};

const sourceEvidence: EvidenceAnchor = {
  id: "fixture-source-panel",
  kind: "source_range",
  file: "src/components/ReviewPanel.tsx",
  start_line: 1,
  end_line: 1,
  description: "ReviewPanel 中直接渲染主要按钮的源码范围",
};

function baseVerification(checks: string[]) {
  return { required: true, checks };
}

export function createVisualMockResponse(request: VisualReviewV02Request): VisualReviewV02Response {
  return visualReviewV02ResponseSchema.parse({
    schema_version: "visual-review-v0.2",
    request_id: request.request_id,
    decision: "NEEDS_REVISION",
    summary: "离线 Visual Mock 已接收截图、DOM 摘要和任务上下文；示例问题用于验证证据链，不代表真实模型结论。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "visual",
      profile: visualProfile,
      observations: [{
        id: "fixture-visual-hierarchy",
        dimension: "hierarchy",
        statement: "示例主标题区域与主要动作存在层级检查点。",
        status: "confirmed",
        severity: "medium",
        confidence: 1,
        evidence: [pixelEvidence, domEvidence],
        recommendation: "先由人工确认标题与主要动作是否形成清晰的首屏阅读顺序。",
        profile: visualProfile,
      }],
    },
    issues: [{
      id: "fixture-visual-001",
      category: "hierarchy",
      severity: "medium",
      confidence: 1,
      evidence: [{ source: "pixel", description: "离线 fixture 的示例区域，不是真实模型观察。", location: "fixture://pixel/hero" }],
      evidence_anchors: [pixelEvidence, domEvidence],
      suggested_fix: "人工检查标题、说明和主要动作的视觉顺序，再决定是否调整间距。",
    }],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [{ action: "人工确认视觉层级", target: "main h1", reason: "Mock 结果不能绕过人工批准。" }] },
    verification: baseVerification(["接入真实视觉 Provider 后重新评审", "确认截图与 DOM 摘要属于同一页面版本"]),
    usage: { mode: "mock", provider: "fixture", model: "fixture-visual-v0.2", input_images: 1, estimated_cost_minor_units: 0, latency_ms: 0 },
  });
}

export function createCodeMockResponse(request: CodeReviewV01Request): CodeReviewV01Response {
  return codeReviewV01ResponseSchema.parse({
    schema_version: "code-review-v0.1",
    request_id: request.request_id,
    decision: "NEEDS_REVISION",
    summary: "离线 Code Mock 已接收源码、AST 和 Diff 引用；示例问题用于验证源码证据链，不代表真实模型结论。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "code",
      profile: codeProfile,
      observations: [{
        id: "fixture-code-boundary",
        dimension: "boundaries",
        statement: "示例组件同时承担展示和交互入口职责，需结合实际模块上下文判断是否拆分。",
        status: "possible",
        severity: "low",
        confidence: 0.8,
        evidence: [sourceEvidence],
        recommendation: "先查看组件调用方和测试，再决定是否拆分。",
        profile: codeProfile,
      }],
    },
    issues: [{
      id: "fixture-code-001",
      category: "boundaries",
      severity: "low",
      confidence: 0.8,
      rule_id: "fixture.component-boundary",
      statement: "示例组件的展示与交互职责可能需要进一步拆分。",
      evidence: [sourceEvidence],
      suggested_fix: "结合调用方、测试和实际状态管理范围，再决定是否提取容器组件。",
    }],
    repair_plan: { type: "source_patch", requires_approval: true, operations: [{ action: "检查组件边界", target: "src/components/ReviewPanel.tsx", reason: "必须结合源码上下文后再批准修改。" }] },
    verification: baseVerification(["运行类型检查", "运行组件测试", "人工确认拆分不会改变交互行为"]),
    usage: { mode: "mock", provider: "fixture", model: "fixture-code-v0.1", latency_ms: 0 },
  });
}

export function createLinkedMockResponse(request: VisualReviewV02Request): VisualReviewV02Response {
  return visualReviewV02ResponseSchema.parse({
    schema_version: "visual-review-v0.2",
    request_id: request.request_id,
    decision: "MANUAL_REVIEW",
    summary: "离线 Linked Mock 已把截图区域、DOM 选择器和源码范围串成一条可回溯链路；没有自动写入源码。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "linked",
      profile: linkedProfile,
      observations: [{
        id: "fixture-linked-001",
        dimension: "dom_source_link",
        statement: "示例主标题可以从截图区域关联到 DOM 选择器，再关联到 ReviewPanel 源码范围。",
        status: "confirmed",
        severity: "observation",
        confidence: 1,
        evidence: [pixelEvidence, domEvidence, sourceEvidence],
        recommendation: "先由用户批准具体修改，再由 Executor 生成并验证补丁。",
        profile: linkedProfile,
      }],
    },
    issues: [{
      id: "fixture-linked-001",
      category: "change_locality",
      severity: "observation",
      confidence: 1,
      evidence: [{ source: "comparison", description: "截图、DOM 和源码均来自同一个离线 fixture。", location: "fixture://linked/hero" }],
      evidence_anchors: [pixelEvidence, domEvidence, sourceEvidence],
      suggested_fix: "在用户批准后，仅修改关联的局部组件并重新截图验证。",
    }],
    repair_plan: { type: "source_patch", requires_approval: true, operations: [{ action: "生成局部源码补丁", target: "src/components/ReviewPanel.tsx", reason: "Linked Mock 只验证定位链路，不执行写入。" }] },
    verification: baseVerification(["用户批准修改计划", "应用补丁后重新采集截图和 DOM", "确认非目标区域没有漂移"]),
    usage: { mode: "mock", provider: "fixture", model: "fixture-linked-v0.1", input_images: 1, estimated_cost_minor_units: 0, latency_ms: 0 },
  });
}

export function createOfflineMockFlow(kind: "visual" | "code" | "linked"): OfflineMockFlow {
  if (kind === "visual") {
    const host = createVisualHostFixture();
    const request = hostCaptureToVisualReviewV02Request(host);
    return { kind, host, request, response: createVisualMockResponse(request) };
  }
  if (kind === "code") {
    const host = createCodeHostFixture();
    const request = createCodeReviewFixture();
    return { kind, host, request, response: createCodeMockResponse(request) };
  }
  const host = createLinkedHostFixture();
  const request = createLinkedReviewFixture();
  return { kind, host, request, response: createLinkedMockResponse(request) };
}

export function assertM2HostFixtureShape(fixture: HostCapture): HostCapture {
  return hostCaptureSchema.parse(fixture);
}

