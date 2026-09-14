import { notFound } from "next/navigation";
import { AgentWorkspace } from "./workspace";

export default function AgentPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AgentWorkspace />;
}
