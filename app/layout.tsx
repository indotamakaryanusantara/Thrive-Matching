import type { Metadata } from 'next';
import { Quattrocento, Quattrocento_Sans } from 'next/font/google';
import './matcher.css';

const quattrocento = Quattrocento({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-quattrocento',
  display: 'swap',
});

const quattrocentoSans = Quattrocento_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-quattrocento-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Thrive Therapy – Find Your Therapist',
  description:
    'Find your best-fit therapist at Thrive Therapy Phoenix. Individual, couples, groups, and intensive programs.',
  metadataBase: new URL('https://thrive-matching.vercel.app'),
  openGraph: {
    title: 'Thrive Therapy – Find Your Therapist',
    url: 'https://thrive-matching.vercel.app',
    siteName: 'Thrive Therapy Matching',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${quattrocento.variable} ${quattrocentoSans.variable}`}>
      <body className={quattrocentoSans.className}>{children}</body>
    </html>
  );
}
