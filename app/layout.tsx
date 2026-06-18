import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'BRIEF — 매일 읽는 해외 트렌드',
  description:
    '기획자·마케터를 위한 해외 뉴스·트렌드 요약 서비스. 이미지 중심 피드와 AI 즉문즉답으로 10초 만에 오늘의 트렌드를 파악하세요.',
  keywords: ['트렌드', '해외뉴스', '마케터', '기획자', '뷰티', '패션', '테크'],
  openGraph: {
    title: 'BRIEF',
    description: '매일 빠르게 훑는 해외 트렌드 요약',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <div className="app-container">
          <main className="brief-main">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
