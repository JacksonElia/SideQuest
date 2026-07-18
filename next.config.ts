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
    // Not for bundling reasons — /api/vendor/livekit-client require.resolve()s
    // this package to serve its ESM build to the bundler-free test page, and
    // that only yields a real node_modules path when webpack leaves it alone.
    "livekit-client",
  ],
};

export default nextConfig;
