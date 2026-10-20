import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const isHttps = (process.env.APP_BASE_URL || '').startsWith('https://');

/**
 * SEC-3 / LINK-6. The participant flow handles people's faces, so the page is
 * locked down hard: no third-party scripts, no framing, no connections to any
 * other origin. The only outside hosts are Wikimedia's media servers, for Commons
 * thumbnails in the editor's media library — images only.
 *
 * 'unsafe-inline' for scripts is what Next.js needs to hydrate statically
 * generated pages without per-request nonces; with every other directive
 * closed it still blocks injected <script src>, exfiltration, framing and
 * <base> hijacking.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isHttps ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // The camera is used by the participant capture screen and nothing else.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  ...(isHttps
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Without this, Next walks up past the project looking for a workspace root
  // and can land on the user's home directory — pinning it keeps file tracing
  // inside WikiFrames.
  outputFileTracingRoot: projectRoot,
  // The Docker image sets this to ship a self-contained server bundle;
  // `npm start` keeps working unchanged without it.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  serverExternalPackages: ['sharp', 'archiver'],
  // `npm run lint` is its own CI step; repeating it inside every production
  // build only makes deployments slower.
  eslint: { ignoreDuringBuilds: true },
  // Every image is served by our own asset route (with its own access rules)
  // or drawn on a canvas; the built-in optimizer is never used, so it is off.
  images: { unoptimized: true },
  async headers() {
    return [
      // Pages and API. Asset responses are excluded: they set their own,
      // stricter sandbox policy, which a page policy here would replace.
      { source: '/((?!api/v1/assets/).*)', headers: securityHeaders },
      {
        source: '/api/v1/assets/:path*',
        headers: securityHeaders.filter((h) => h.key !== 'Content-Security-Policy'),
      },
    ];
  },
  webpack(config) {
    // fabric/extensions bundles an optional touch-gesture integration whose
    // peer ("westures") we do not use; resolve it to nothing.
    config.resolve.alias = { ...config.resolve.alias, westures: false };
    return config;
  },
};

export default nextConfig;
