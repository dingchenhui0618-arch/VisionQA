"use client";

import { WorkspaceLogin } from "../../workspace-login";

export function InternalLoginClient() {
  return (
    <WorkspaceLogin
      onAuthenticated={() => {
        window.location.assign("/internal");
      }}
    />
  );
}
