import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Registrarse - TrueTally',
  description: 'Crea tu cuenta en TrueTally y participa en votaciones democráticas seguras basadas en blockchain.',
  keywords: 'registro, crear cuenta, votación blockchain, democracia digital, TrueTally',
  openGraph: {
    title: 'Registrarse - TrueTally',
    description: 'Crea tu cuenta y participa en votaciones democráticas seguras.',
    url: `${baseUrl}/register`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Registrarse - TrueTally',
    description: 'Crea tu cuenta y participa en votaciones democráticas seguras.',
  },
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}