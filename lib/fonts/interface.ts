import { DM_Sans, Outfit } from 'next/font/google';

export const nooklieBody = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-nooklie-body',
});

export const nooklieHeading = Outfit({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-nooklie-heading',
});
