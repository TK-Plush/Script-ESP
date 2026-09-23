/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  ...(process.env.STATIC_EXPORT
    ? {
        output: "export",
        trailingSlash: true,
        assetPrefix: process.env.CF_ASSET_PREFIX || "",
      }
    : {}),
};

export default nextConfig;