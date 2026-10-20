import type { NextConfig } from "next";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Dev only: lets phones on the same Wi-Fi open the dev server by the PC's
  // local IP (e.g. http://192.168.1.5:3000). Without this, Next blocks the
  // page's scripts and the login form never works on the phone.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],

  // The browser talks to Supabase through this site (/supabase/...) instead
  // of *.supabase.co directly. Some phones can't reach supabase.co (Private
  // DNS / ad-block DNS, VPNs, some ISPs) and show "Failed to fetch"; this way
  // the phone only ever connects to our own site.
  async rewrites() {
    if (!supabaseUrl) return [];
    return [{ source: "/supabase/:path*", destination: `${supabaseUrl}/:path*` }];
  },
};

export default nextConfig;
