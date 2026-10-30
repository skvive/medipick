import type { NextConfig } from 'next';

const pages = [
  'admin',
  'advertiser',
  'consult',
  'doctors',
  'premium-admin',
  'doctor-finance',
  'my-health',
  'marketing-console',
  'integrations',
  'clinic-ops',
  'clinic-access',
  'smart-store',
];

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      ...pages.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
    ];
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    },
  ],
};

export default nextConfig;
