import './globals.css';
import { config } from '@/lib/config';

export const metadata = {
  metadataBase: new URL(config.baseUrl),
  title: {
    default: 'WikiFrames — campaign frames for the Wikimedia community',
    template: '%s · WikiFrames',
  },
  description:
    'Create a branded photo frame campaign for your Wikimedia event in minutes. Share one link or QR code, and every attendee walks away with a personalised, shareable image.',
  openGraph: {
    type: 'website',
    siteName: 'WikiFrames',
    title: 'WikiFrames — campaign frames for the Wikimedia community',
    description:
      'Turn every event attendee into a storyteller. One link, one photo, one tap.',
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: '#3366cc',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans antialiased">
        {/* WCAG 2.1 AA: keyboard users get past the nav in one press. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:rounded-lg focus:bg-wiki-blue focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
