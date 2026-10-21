import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { BlogAnnouncementBanner } from '../../../../../src/banner.js';
import '../../../../../src/style.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-top': () => h(BlogAnnouncementBanner) }),
};
