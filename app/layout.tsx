import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NarrativeX — Comment Manager',
  description: 'AI-powered Instagram comment management for NarrativeX clients',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('nx-theme') || 'dark';
                document.documentElement.classList.toggle('dark', t === 'dark');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-nx-bg text-nx-text transition-colors duration-300">
        {children}
      </body>
    </html>
  )
}
