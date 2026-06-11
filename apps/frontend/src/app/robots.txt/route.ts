import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const robotsTxt = `User-agent: *
Allow: /

# Block access to admin areas
Disallow: /admin
Disallow: /api/

# Allow important pages
Allow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}