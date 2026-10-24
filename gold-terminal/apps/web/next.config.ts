import type { NextConfig } from "next";

const config: NextConfig = {
  // The shared core package ships TypeScript sources.
  transpilePackages: ["@gold/core"],
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  poweredByHeader: false,
};

export default config;
