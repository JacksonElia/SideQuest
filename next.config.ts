import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Moss ships its engine as a native Node addon (`.node` binaries, one per
   * platform). Webpack has no loader for those and fails the build trying to
   * parse them as JavaScript, so the package is required at runtime instead of
   * being bundled. This is the supported escape hatch for native dependencies.
   */
  serverExternalPackages: [
    "@moss-dev/moss",
    "@moss-dev/moss-core",
  ],
};

export default nextConfig;
