import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^https:/, "wss:");
const vercelPreview = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";

/**
 * Content Security Policy: what the browser may load and where it may connect. Mainly it stops other sites
 * from framing Connext (click-jacking), blocks plugins, and limits connections to our own server and
 * Supabase. 'unsafe-inline' scripts are still allowed (Next.js needs them without nonces), so it is
 * not a full defence against injected scripts. 'wasm-unsafe-eval' is for pdf.js decoding scanned PDFs;
 * dev mode adds 'unsafe-eval' for React's debugging tools.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}${vercelPreview}`,
  `style-src 'self' 'unsafe-inline'${vercelPreview}`,
  `img-src 'self' data: blob: ${supabase}${vercelPreview}`,
  "font-src 'self' data:",
  // www.googleapis.com: the browser sends teachers' PDFs straight to their own Google Drive (migration 0019).
  `connect-src 'self' ${supabase} ${supabaseWs} https://www.googleapis.com${dev ? " ws:" : ""}${vercelPreview}`,
  "worker-src 'self' blob:",
  `frame-src 'self'${vercelPreview}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: almost every page here depends on who
  // is logged in, so pages render fresh on each request. Simpler to reason about.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
