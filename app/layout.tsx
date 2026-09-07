import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '신디사이저 조작법 배우기',
  description:
    '내 악기를 확인하고, 화면 속 패널에서 버튼부터 하나씩 배워 보세요.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
