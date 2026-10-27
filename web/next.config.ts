import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext performs its own development-origin check before a route can see
  // the request. Chrome MV3 pages use `chrome-extension://<id>` origins, so
  // allow the unpacked extension's hostname here (not the full scheme URL).
  // The smoke-test default is `audit`; set VISIONQA_CHROME_EXTENSION_ID to
  // the id shown by chrome://extensions for a local installation.
  allowedDevOrigins: [process.env.VISIONQA_CHROME_EXTENSION_ID?.trim() || "audit"],
  experimental: {
    // The plugin sends governed local image payloads through a multipart
    // request. Keep the proxy above the route's 14 MB application limit.
    proxyClientMaxBodySize: "16mb",
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
