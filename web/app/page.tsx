import type { Metadata } from "next";
import Landing from "./landing/Landing";

export const metadata: Metadata = {
  title: "VisionQA · AI 模特图修正与交付",
  description:
    "以商品白底图为真值，为服饰电商定位并修正 AI 模特图中的商品漂移、人体异常和非目标变化。",
};

export default function Home() {
  return <Landing />;
}
