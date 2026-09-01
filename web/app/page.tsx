import type { Metadata } from "next";
import Landing from "./landing/Landing";

export const metadata: Metadata = {
  title: "VisionQA · 批量找出需要返工的商品图",
  description:
    "同一 SKU 最多免费筛查 10 张候选图，只对需要处理的图片发起修正，成功后再扣内测额度。",
};

export default function Home() {
  return <Landing />;
}
