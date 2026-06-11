import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Bloques Blockchain - TrueTally',
  description: 'Explora todos los bloques de la cadena de bloques de TrueTally. Cada bloque contiene votos verificados y transacciones inmutables del sistema de votación.',
  keywords: 'bloques blockchain, cadena de bloques, votación blockchain, TrueTally',
  openGraph: {
    title: 'Bloques Blockchain - TrueTally',
    description: 'Explora todos los bloques de la cadena de bloques de TrueTally.',
    url: `${baseUrl}/blocks`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Bloques Blockchain - TrueTally',
    description: 'Explora todos los bloques de la cadena de bloques de TrueTally.',
  },
}

export default function BlocksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}