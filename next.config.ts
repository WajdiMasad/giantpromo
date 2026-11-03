import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async redirects() {
    return [
      { source: "/quotes", destination: "/projects", permanent: false },
      { source: "/quotes/new", destination: "/projects/new", permanent: false },
      { source: "/jobs", destination: "/projects", permanent: false },
      { source: "/jobs/:id", destination: "/projects/:id", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
