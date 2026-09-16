import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Customer projects from 0002 with conversation-origin identity added by 0005.
// SQL migrations remain authoritative for foreign keys and paired-null checks.
export const customerProjects = pgTable("projects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  isExample: boolean("is_example").notNull().default(false),
  originUserId: text("origin_user_id"),
  originConversationId: text("origin_conversation_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("projects_conversation_origin_idx").on(table.tenantId, table.originUserId, table.originConversationId)]);

export const batches = pgTable(
  "batches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    scenario: text("scenario").notNull(),
    commercialTemplateId: text("commercial_template_id"),
    commercialTemplateVersion: text("commercial_template_version"),
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestSha256: text("request_sha256"),
    lockedAttributesJson: text("locked_attributes_json").notNull().default("[]"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("batches_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("batches_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    tenantId: text("tenant_id"),
    sourceUrl: text("source_url").notNull(),
    productLabel: text("product_label").notNull(),
    sha256: text("sha256"),
    mimeType: text("mime_type"),
    byteSize: bigint("byte_size", { mode: "number" }),
    storageProvider: text("storage_provider")
      .notNull()
      .default("aliyun_oss"),
    objectKey: text("object_key"),
    repairAttemptId: text("repair_attempt_id"),
    storageRegion: text("storage_region").notNull().default("cn-beijing"),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("assets_tenant_sha256_unique").on(
      table.tenantId,
      table.sha256,
    ),
    index("assets_batch_idx").on(table.batchId),
  ],
);

export const batchAssets = pgTable(
  "batch_assets",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    role: text("role").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("batch_assets_batch_asset_role_unique").on(
      table.batchId,
      table.assetId,
      table.role,
    ),
    uniqueIndex("batch_assets_batch_role_position_unique").on(
      table.batchId,
      table.role,
      table.position,
    ),
  ],
);

export const evaluationRuns = pgTable("evaluation_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  batchId: text("batch_id").references(() => batches.id),
  providerId: text("provider_id"),
  adapterVersion: text("adapter_version"),
  modelSnapshot: text("model_snapshot").notNull(),
  promptVersion: text("prompt_version").notNull(),
  taxonomyVersion: text("taxonomy_version"),
  scorePolicyVersion: text("score_policy_version").notNull(),
  thresholdPolicyVersion: text("threshold_policy_version"),
  gatePolicyVersion: text("gate_policy_version").notNull(),
  calibrationStatus: text("calibration_status").notNull(),
  status: text("status").notNull().default("QUEUED"),
  requestId: text("request_id"),
  idempotencyKey: text("idempotency_key"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const evaluationJobs = pgTable(
  "evaluation_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    runId: text("run_id").references(() => evaluationRuns.id),
    assetId: text("asset_id").references(() => assets.id),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    evaluationId: text("evaluation_id"),
    stateVersion: integer("state_version").notNull().default(1),
    lastStateKey: text("last_state_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("evaluation_jobs_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("evaluation_jobs_status_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
  ],
);

export const assetEvaluations = pgTable(
  "asset_evaluations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    runId: text("run_id")
      .notNull()
      .references(() => evaluationRuns.id),
    decision: text("decision").notNull(),
    overallScore: doublePrecision("overall_score"),
    skillScoresJson: text("skill_scores_json").notNull(),
    issuesJson: text("issues_json").notNull(),
    commercialAssessment: text("commercial_assessment").notNull(),
    repairPrompt: text("repair_prompt").notNull(),
    lockedAttributesJson: text("locked_attributes_json").notNull(),
    resultJson: text("result_json"),
    resultSha256: text("result_sha256"),
    schemaVersion: text("schema_version"),
    resultVersion: integer("result_version").notNull().default(1),
    idempotencyKey: text("idempotency_key"),
    commercialTemplateId: text("commercial_template_id"),
    commercialTemplateVersion: text("commercial_template_version"),
    modelStatus: text("model_status"),
    gateStatus: text("gate_status"),
    latencyMs: integer("latency_ms"),
    costAmount: doublePrecision("cost_amount"),
    costCurrency: text("cost_currency"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("asset_evaluations_run_asset_unique").on(
      table.runId,
      table.assetId,
    ),
    uniqueIndex("asset_evaluations_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("asset_evaluations_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const humanOverrides = pgTable(
  "human_overrides",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    assetEvaluationId: text("asset_evaluation_id")
      .notNull()
      .references(() => assetEvaluations.id),
    originalDecision: text("original_decision").notNull(),
    humanDecision: text("human_decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceNote: text("evidence_note").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    requestId: text("request_id"),
    idempotencyKey: text("idempotency_key"),
    baseEvaluationVersion: integer("base_evaluation_version"),
    resultingEvaluationVersion: integer("resulting_evaluation_version"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("human_overrides_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    uniqueIndex("human_overrides_evaluation_base_version_unique").on(
      table.assetEvaluationId,
      table.baseEvaluationVersion,
    ),
    index("human_overrides_evaluation_created_idx").on(
      table.assetEvaluationId,
      table.createdAt,
    ),
  ],
);

export const commercialTemplates = pgTable("commercial_templates", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  version: text("version").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  configJson: text("config_json").notNull(),
  createdAt: createdAt(),
});

export const commercialProfiles = pgTable("commercial_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  version: text("version").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => commercialTemplates.id),
  status: text("status").notNull(),
  preferencesJson: text("preferences_json").notNull(),
  acceptedEventCount: integer("accepted_event_count").notNull().default(0),
  createdAt: createdAt(),
});

export const commercialRecalibrationLogs = pgTable(
  "commercial_recalibration_logs",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    commercialTemplateId: text("commercial_template_id")
      .notNull()
      .references(() => commercialTemplates.id),
    commercialProfileId: text("commercial_profile_id").references(
      () => commercialProfiles.id,
    ),
    assetEvaluationId: text("asset_evaluation_id")
      .notNull()
      .references(() => assetEvaluations.id),
    systemFitScore: doublePrecision("system_fit_score"),
    humanFitScore: doublePrecision("human_fit_score"),
    originalDecision: text("original_decision").notNull(),
    humanDecision: text("human_decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceNote: text("evidence_note").notNull(),
    status: text("status").notNull().default("CAPTURED"),
    actorId: text("actor_id").notNull(),
    createdAt: createdAt(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    requestId: text("request_id"),
    tenantId: text("tenant_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("audit_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

// Agent runtime tables are append/revision oriented. They complement the
// customer-beta project/credit tables created by drizzle-pg/0002.
export const productConversationContexts = pgTable(
  "product_conversation_contexts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    productId: text("product_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    contextJson: jsonb("context_json").notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_context_tenant_conversation_unique").on(table.tenantId, table.conversationId),
    index("product_context_project_idx").on(table.tenantId, table.projectId),
  ],
);

export const imageVersions = pgTable(
  "image_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    productId: text("product_id").notNull(),
    assetId: text("asset_id").notNull(),
    parentVersionId: text("parent_version_id"),
    versionKind: text("version_kind").notNull(),
    instruction: text("instruction").notNull(),
    confirmationJson: jsonb("confirmation_json").notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [
    index("image_versions_asset_created_idx").on(table.tenantId, table.assetId, table.createdAt),
    index("image_versions_parent_idx").on(table.parentVersionId),
  ],
);

export const modelCallLedger = pgTable(
  "model_call_ledger",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id"),
    conversationId: text("conversation_id"),
    requestId: text("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    operation: text("operation").notNull(),
    providerId: text("provider_id").notNull(),
    modelSnapshot: text("model_snapshot").notNull(),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    inputImageCount: integer("input_image_count"),
    outputImageCount: integer("output_image_count"),
    costAmount: doublePrecision("cost_amount"),
    costCurrency: text("cost_currency").notNull().default("CNY"),
    latencyMs: integer("latency_ms"),
    retryOf: text("retry_of"),
    idempotencyKey: text("idempotency_key").notNull(),
    errorCode: text("error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("model_call_tenant_idempotency_unique").on(table.tenantId, table.idempotencyKey),
    index("model_call_project_created_idx").on(table.tenantId, table.projectId, table.createdAt),
  ],
);

// Columns added by 0004. The customer beta tables themselves originate in
// 0002; these exports keep the transaction-critical repair state visible to
// Drizzle without changing the existing in-memory BetaService contract.
export const repairAttemptsRuntime = pgTable(
  "repair_attempts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    screeningItemId: text("screening_item_id").notNull(),
    sourceAssetId: text("source_asset_id").notNull(),
    outputAssetId: text("output_asset_id"),
    issue: text("issue").notNull(),
    issueRegionJson: jsonb("issue_region_json").notNull(),
    lockedRegionsJson: jsonb("locked_regions_json").notNull(),
    status: text("status").notNull(),
    gateVersion: text("gate_version").notNull(),
    gateResult: text("gate_result").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    executionOwner: text("execution_owner"),
    executionStartedAt: timestamp("execution_started_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("repair_attempts_tenant_idempotency_runtime_unique").on(table.tenantId, table.idempotencyKey),
    index("repair_attempts_project_status_runtime_idx").on(table.tenantId, table.projectId, table.status),
  ],
);
