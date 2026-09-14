import { POST as runLiveEvaluation } from "../live-evaluate/route";
import { requireBetaSessionFromRequest } from "../../../lib/beta/auth";
import { authorizeModelDispatch } from "../../../lib/beta/budget";
import { CustomerVisibleError, customerErrorResponse } from "../../../lib/beta/contracts";
import { mapEvaluationToCustomerScreening } from "../../../lib/beta/screening";
import { getBetaService } from "../../../lib/beta/service";

export async function POST(request: Request) {
  const service = getBetaService();
  let session;
  let batchId: string | null = null;
  try {
    session = await requireBetaSessionFromRequest(request);
    const input = (await request.json()) as Record<string, unknown>;
    const batch = service.createScreeningBatch(session, {
      projectId: String(input.project_id ?? ""),
      skuName: String(input.sku_name ?? ""),
      truthAssetIds: stringList(input.truth_asset_ids),
      candidateAssetIds: stringList(input.candidate_asset_ids),
    });
    batchId = batch.id;
    const references = batch.truthAssetIds.map((id) => service.readAsset(session!, id));
    const results = [];
    for (const candidateId of batch.candidateAssetIds) {
      const candidate = service.readAsset(session, candidateId);
      const budget = authorizeModelDispatch(10);
      const form = new FormData();
      form.set(
        "candidate",
        new File([candidate.bytes], candidate.asset.fileName, { type: candidate.asset.mimeType }),
      );
      for (const reference of references) {
        form.append(
          "references",
          new File([reference.bytes], reference.asset.fileName, { type: reference.asset.mimeType }),
        );
      }
      form.set("consent", "confirmed");
      form.set("channel", "服饰电商");
      form.set("placement", "同用途候选图");
      form.set("referenceStatus", "complete");
      form.set("provenanceStatus", "known");
      form.set("commercialTemplateId", "model-image-repair");
      form.set("customerProfile", JSON.stringify({ skuFacts: ["以本批次商品真值图为准"] }));

      let response: Response;
      try {
        response = await runLiveEvaluation(
          new Request("http://localhost/api/live-evaluate", {
            method: "POST",
            body: form,
            headers: { "x-request-id": `customer_screen_${crypto.randomUUID()}` },
            signal: request.signal,
          }),
        );
      } finally {
        budget.record();
      }
      if (!response.ok) {
        throw new CustomerVisibleError(
          "MODEL_FAILED",
          "本次批量筛查没有完成。",
          503,
          "图片和项目已保留，请稍后点击“重新筛查”；筛查免费，不会扣除内测额度。",
        );
      }
      results.push(mapEvaluationToCustomerScreening(candidate.asset.id, await response.json()));
    }
    const completed = service.completeScreeningBatch(session, batch.id, results);
    return Response.json(
      { batch: completed, credits: service.getCredits(session) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (session && batchId) service.failScreeningBatch(session, batchId);
    return customerErrorResponse(error);
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];
}
