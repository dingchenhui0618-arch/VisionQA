export type Material = { id: string; role: "TRUTH" | "CANDIDATE" | "REPAIR_OUTPUT"; fileName: string; byteSize: number; width: number; height: number };

export function selectionProblem(assets: Material[], selected: string[]): string | null {
  const items = assets.filter(asset => selected.includes(asset.id));
  const truths = items.filter(asset => asset.role === "TRUTH").length;
  const candidates = items.filter(asset => asset.role === "CANDIDATE").length;
  if (!truths) return "下一步：添加并选择至少 1 张商品参考图，作为颜色和结构的依据。";
  if (truths > 4) return "商品参考图最多选择 4 张，请取消多选的图片。";
  if (!candidates) return "下一步：添加并选择要检查的商品图。";
  if (candidates > 10) return "待检查图最多选择 10 张，请取消多选的图片。";
  return null;
}

export function fileProblem(file: { name: string; size: number; type: string }): string | null {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return `${file.name}：请使用 JPG、PNG 或 WebP。`;
  if (!file.size || file.size > 10 * 1024 * 1024) return `${file.name}（${(file.size / 1024 / 1024).toFixed(2)} MB）：请导出为 10 MB 以内的非空图片后重新选择。`;
  return null;
}

export async function materialPayload<T>(response: Response): Promise<T> {
  let payload;
  try { payload = await response.json(); } catch { throw new Error("服务暂时没有返回结果。请刷新查看任务状态，不要连续提交。"); }
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(typeof error?.message === "string" ? `${error.message} ${error.next_action ?? ""}` : "操作未完成，请刷新查看状态；不要连续提交。");
  }
  return payload as T;
}
