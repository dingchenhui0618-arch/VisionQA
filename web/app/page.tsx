import type { Metadata } from "next";
import Landing from "./landing/Landing";

export const metadata: Metadata = {
  title: "VisionQA · Visual judgment plugin",
  description:
    "可嵌入其他智能体的视觉判断与修正插件：读取上下文、给出证据、提出修正并复验结果。",
};

export default function Home() {
  return <Landing />;
}
