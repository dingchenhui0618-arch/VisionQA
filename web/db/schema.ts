import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    tenantId: text("tenant_id"),
    sourceUrl: text("source_url").notNull(),
    productLabel: text("product_label").notNull(),
    sha256: text("sha256"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    r2Key: text("r2_key"),
    retentionUntil: text("retention_until"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("assets_tenant_sha256_unique").on(
      table.tenantId,
      table.sha256,
    ),
    index("assets_batch_idx").on(table.batchId),
  ],
);

export const batches = sqliteTable(
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
    lockedAttributesJson: text("locked_attributes_json")
      .notNull()
      .default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("batches_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("batches_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const batchAssets = sqliteTable(
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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const evaluationRuns = sqliteTable("evaluation_runs", {
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
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evaluationJobs = sqliteTable(
  "evaluation_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => evaluationRuns.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: text("next_retry_at"),
    errorCode: text("error_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const assetEvaluations = sqliteTable(
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
    overallScore: real("overall_score"),
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
    costAmount: real("cost_amount"),
    costCurrency: text("cost_currency"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const humanOverrides = sqliteTable(
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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("human_overrides_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("human_overrides_evaluation_created_idx").on(
      table.assetEvaluationId,
      table.createdAt,
    ),
  ],
);

export const commercialTemplates = sqliteTable("commercial_templates", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  version: text("version").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  configJson: text("config_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const commercialProfiles = sqliteTable("commercial_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  version: text("version").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => commercialTemplates.id),
  status: text("status").notNull(),
  preferencesJson: text("preferences_json").notNull(),
  acceptedEventCount: integer("accepted_event_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const commercialRecalibrationLogs = sqliteTable(
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
    systemFitScore: real("system_fit_score"),
    humanFitScore: real("human_fit_score"),
    originalDecision: text("original_decision").notNull(),
    humanDecision: text("human_decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceNote: text("evidence_note").notNull(),
    status: text("status").notNull().default("CAPTURED"),
    actorId: text("actor_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: text("request_id"),
    tenantId: text("tenant_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
