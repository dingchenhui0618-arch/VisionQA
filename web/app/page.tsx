import type { Metadata } from "next";
import Landing from "./landing/Landing";

export const metadata: Metadata = {
  title: "VisionQA · 服饰电商视觉质量评估",
  description:
    "从真实感到商品表达效能，为服饰电商提供结构化评分、改图复审与营销交付。",
};

export default function Home() {
  return <Landing />;
}
