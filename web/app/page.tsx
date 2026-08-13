import type { Metadata } from "next";
import Landing from "./landing/Landing";

export const metadata: Metadata = {
  title: "VisionQA · 服饰电商视觉质量评估",
  description:
    "从真实感到商业价值，为服饰电商提供结构化评分、修复 Prompt 与人工审核。",
};

export default function Home() {
  return <Landing />;
}
