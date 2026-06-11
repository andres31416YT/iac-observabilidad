import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Iniciar Sesión - TrueTally',
  description: 'Accede a tu cuenta en TrueTally para votar de forma segura y participar en elecciones democráticas basadas en blockchain.',
  keywords: 'login, iniciar sesión, autenticación, votación blockchain, TrueTally',
  openGraph: {
    title: 'Iniciar Sesión - TrueTally',
    description: 'Accede a tu cuenta para votar de forma segura en TrueTally.',
    url: `${baseUrl}/login`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Iniciar Sesión - TrueTally',
    description: 'Accede a tu cuenta para votar de forma segura en TrueTally.',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}