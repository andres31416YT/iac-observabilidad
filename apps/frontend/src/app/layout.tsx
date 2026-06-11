import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Script from 'next/script';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const getBaseUrl = () => baseUrl;

export const metadata: Metadata = {
  title: 'TrueTally - Sistema de Votación Blockchain Seguro',
  description: 'Sistema de votación electrónica inmutable basado en blockchain. Vota de forma segura, transparente y verificable. Tecnología blockchain para elecciones democráticas.',
  keywords: 'votación blockchain, elecciones seguras, votación electrónica, democracia digital, TrueTally',
  authors: [{ name: 'TrueTally Team' }],
  creator: 'TrueTally',
  publisher: 'TrueTally',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: baseUrl,
    title: 'TrueTally - Votación Blockchain Segura',
    description: 'Sistema de votación electrónica inmutable basado en blockchain. Tecnología blockchain para elecciones democráticas.',
    siteName: 'TrueTally',
    images: [
      {
        url: `${baseUrl}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: 'TrueTally - Sistema de Votación Blockchain',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrueTally - Votación Blockchain Segura',
    description: 'Sistema de votación electrónica inmutable basado en blockchain.',
    images: [`${baseUrl}/og-image.jpg`],
    creator: '@truetally',
  },
  verification: {
    google: 'google-site-verification-code',
  },
  alternates: {
    canonical: baseUrl,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "TrueTally",
              "description": "Sistema de votación electrónica inmutable basado en blockchain",
              "url": baseUrl,
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "TrueTally Team"
              },
              "featureList": [
                "Votación blockchain segura",
                "Resultados transparentes",
                "Prevención de fraude",
                "Verificación criptográfica",
                "Acceso democrático"
              ]
            })
          }}
        />
      </head>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}