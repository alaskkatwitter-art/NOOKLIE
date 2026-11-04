import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(self), geolocation=(), payment=()'},{key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"}]},{ source: '/fonts/reader/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
  },
};

export default config;
