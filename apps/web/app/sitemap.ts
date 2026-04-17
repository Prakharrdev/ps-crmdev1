import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://jansamadhan.perkkk.dev';

  // Publicly accessible routes
  const routes = [
    '',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/leaderboard',
    '/citizen',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : 0.8,
  }));
}
