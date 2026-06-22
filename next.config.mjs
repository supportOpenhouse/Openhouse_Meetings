/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  },
};

export default nextConfig;
