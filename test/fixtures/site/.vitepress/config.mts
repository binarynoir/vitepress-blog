import { defineConfig } from 'vitepress';
import { withBlog } from '../../../../src/vitepress.js';

export default withBlog(
  defineConfig({
    title: 'Fixture',
    description: 'A site for testing the blog plugin.',
    cleanUrls: true,
    sitemap: { hostname: 'https://example.com' },
  }),
  {
    authors: { jane: { name: 'Jane Doe', url: 'https://example.com/jane' } },
  },
);
