import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '后室中文数据库审核管理面板',
  description: '后室中文数据库内部内容审核工具',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
