import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerProject } from "../../../customer/customer-project";
import { getBetaSessionFromPage } from "../../../../lib/beta/auth";
import { getBetaService } from "../../../../lib/beta/service";
import { createSignedDownloadUrl } from "../../../../lib/beta/asset-urls";

export const metadata: Metadata = {
  title: "SKU 检查批次 · VisionQA",
  description: "上传商品真值和候选图，完成免费筛查、问题修正与对比下载。",
};

export default async function CustomerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getBetaSessionFromPage();
  if (!session) redirect("/login");
  const { id } = await params;
  const service = getBetaService();
  const repair = service.latestRepairForProject(session, id);
  return (
    <CustomerProject
      session={session}
      initialProject={service.getProject(session, id)}
      initialCredits={service.getCredits(session)}
      initialBatch={service.latestBatchForProject(session, id)}
      initialRepair={repair}
      initialDownloadUrl={repair?.status === "CAPTURED" && repair.outputAssetId ? await createSignedDownloadUrl(session, repair.outputAssetId) : null}
    />
  );
}
