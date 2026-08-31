import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'KidneyQuant — Stain analysis workbench',
  description: 'Private microscopy stain quantification for kidney tissue images.',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'KidneyQuant',
    description: 'Private stain analysis for kidney tissue',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'KidneyQuant private stain analysis for kidney tissue' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KidneyQuant',
    description: 'Private stain analysis for kidney tissue',
    images: ['/og.png'],
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
