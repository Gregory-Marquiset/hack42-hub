import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  // The dev-mode "static indicator" badge throws on an `isrManifest` HMR
  // message in this setup (Next 15.5.15) and its host `<nextjs-portal>`
  // element is left covering the full viewport, silently swallowing every
  // click underneath it (including, e.g., the account menu button). No
  // effect on the production build — this is dev-server-only tooling.
  devIndicators: false,
};

export default nextConfig;
