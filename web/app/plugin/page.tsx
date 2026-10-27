import { PluginWorkspace } from "./plugin-workspace";
import "./plugin.css";

export const metadata = {
  title: "VisionQA · 视觉评审插件",
  description: "接收宿主上下文，用统一 VisualReview Contract 返回可复验的视觉评审结果。",
};

export default function PluginPage() {
  return <PluginWorkspace />;
}
