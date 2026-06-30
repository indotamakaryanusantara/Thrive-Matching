import type { Metadata } from 'next';
import './matcher.css';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
