import type { Metadata } from 'next';
import './globals.css';
import { SessionProviderWrapper } from '@/components/providers/SessionProviderWrapper';

export const metadata: Metadata = {
  title: 'General Chat Interface',
  description: 'A multi-provider LLM chat interface',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, height: '100vh', overflow: 'hidden' }}>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
