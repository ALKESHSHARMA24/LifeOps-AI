/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // These packages use Node.js APIs that can't be bundled for the browser.
    // Telling Next.js to load them directly from node_modules at runtime.
    serverComponentsExternalPackages: ["postgres", "pdf-parse"],
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
