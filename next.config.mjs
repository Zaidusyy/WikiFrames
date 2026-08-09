import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Without this, Next walks up past the project looking for a workspace root
  // and can land on the user's home directory — pinning it keeps file tracing
  // inside WikiFrames.
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ['sharp', 'archiver'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
    ],
  },
  async headers() {
    // SEC-3 / LINK-6: strict transport + no-sniff everywhere. CSP is intentionally
    // permissive for `img-src` because participants paste Commons URLs.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
