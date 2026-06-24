/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Stamped once at build time, so the client bundle and the server share one id
  // per deploy. VersionGate compares them and refreshes the app when a newer
  // build is live (Android WebViews cache JS hard, so users otherwise run stale
  // code — and stale bugs — until their cache happens to expire).
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      String(Date.now()),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
    // Tree-shake the lucide-react icon barrel so each page only ships the icons
    // it actually imports (smaller JS → faster hydration / snappier clicks).
    optimizePackageImports: ['lucide-react'],
    // Keep recently-visited routes in the client Router Cache so back/forward
    // and tab-switching are instant instead of re-fetching from the server.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
