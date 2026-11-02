import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      // Training-specific controls. These depend on crawler compliance and are
      // not authentication, DRM, or a guarantee against third-party copying.
      { userAgent: ['GPTBot', 'ClaudeBot', 'Google-Extended'], disallow: '/' },
    ],
  };
}
