import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'KidneyQuant — Stain analysis workbench',
  description: 'Private microscopy stain quantification for kidney tissue images.',
  robots: { index: false, follow: false },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
