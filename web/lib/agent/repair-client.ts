export type Region = { x: number; y: number; width: number; height: number };
export function regionProblem(r: Region): string | null {
  if (!Object.values(r).every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) return "请把修改范围设在图片内，宽和高必须大于 0。";
  if (r.width * r.height > 0.95) return "当前范围接近整张图片，请缩小到局部问题，保留可核对的非目标区域。";
  return null;
}
export function lockedOutside(r: Region): Region[] {
  return [
    { x: 0, y: 0, width: 1, height: r.y },
    { x: 0, y: r.y, width: r.x, height: r.height },
    { x: r.x + r.width, y: r.y, width: 1 - r.x - r.width, height: r.height },
    { x: 0, y: r.y + r.height, width: 1, height: 1 - r.y - r.height },
  ].filter(a => a.width > 0.000001 && a.height > 0.000001);
}
