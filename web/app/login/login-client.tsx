"use client";

import { WorkspaceLogin } from "../workspace-login";

export function LoginClient() {
  return (
    <WorkspaceLogin
      onAuthenticated={() => {
        window.location.assign("/workspace");
      }}
    />
  );
}
