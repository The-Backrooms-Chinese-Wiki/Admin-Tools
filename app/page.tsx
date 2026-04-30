'use client';

import { useEffect, useState } from 'react';

interface PageInfo {
  pageid: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;
  timestamp: string;
}

interface AuditData {
  unreviewed: PageInfo[];
  failed: FailedPageInfo[];
  orphanedStatus: PageInfo[];
}

export default function Home() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  fetch('/api/audit', { cache: 'no-store' })  // 添加这个选项
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      if (json.error) throw new Error(json.error);
      setData(json);
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));
}, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xl animate-pulse">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-4 bg-red-50 border border-red-300 rounded">
        <h2 className="text-lg font-bold text-red-800">加载失败</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 顶部 LOGO 与审核规则 */}
      <header className="text-center mb-12">
        <a href="https://backroomszh.org" target="_blank" rel="noopener noreferrer">
          <img
            src="https://static.miraheze.org/backroomszhwiki/1/16/SiteLogo.png"
            alt="Site Logo"
            className="h-24 mx-auto mb-4"
          />
        </a>
        <h1 className="text-3xl font-bold mb-6">审核管理面板</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-left max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-amber-800 mb-3">审核与删除要求</h2>
          <p className="text-amber-900 leading-relaxed">
            若是文章并未严重违规或是危害站点安全、而是出现了明显的质量不足的问题，则其在经过审核流程之后的
            <strong className="text-red-700">15天时间之内</strong>
            ，若发现仍然未经过任何改正，则会被从主命名空间页面移动回作者的沙盒。
            再次重申一遍，请审核们不要直接对质量不达标的文章进行删除，而是在其审核状态被设定为“不通过”且一直未经改正的
            <strong className="text-red-700">15天之后</strong>，再将其移动回作者的沙盒。
          </p>
        </div>
        <nav className="mt-4">
          <a
            href="https://backroomszh.org"
            className="text-blue-600 hover:underline font-medium"
          >
            返回主页
          </a>
        </nav>
      </header>

      {/* 未审核页面 */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-blue-800">📄 未审核页面</h2>
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
            共 {data.unreviewed.length} 个
          </span>
        </div>
        {data.unreviewed.length === 0 ? (
          <p className="text-gray-500">暂无未审核页面 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded-lg">
              <thead className="bg-blue-50">
                <tr>
                  <th className="text-left p-3 border">主页面</th>
                  <th className="text-left p-3 border">Status 页面</th>
                  <th className="text-left p-3 border">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.unreviewed.map((page) => (
                  <tr key={page.pageid} className="hover:bg-gray-50">
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title)}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        {page.title}
                      </a>
                    </td>
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/Status:${encodeURIComponent(page.title)}`}
                        target="_blank"
                        className="text-purple-600 hover:underline"
                      >
                        Status:{page.title}
                      </a>
                    </td>
                    <td className="p-3 border">
                      <span className="text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded text-sm">
                        待审核
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 未过审页面 */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-red-800">🚫 未过审页面</h2>
          <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
            共 {data.failed.length} 个
          </span>
        </div>
        {data.failed.length === 0 ? (
          <p className="text-gray-500">所有已审核页面均已通过 ✅</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded-lg">
              <thead className="bg-red-50">
                <tr>
                  <th className="text-left p-3 border">主页面</th>
                  <th className="text-left p-3 border">Status 页面</th>
                  <th className="text-left p-3 border">审核时间</th>
                  <th className="text-left p-3 border">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.failed.map((page) => (
                  <tr key={page.pageid} className="hover:bg-gray-50">
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title.replace(/^Status:/, ''))}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        {page.title.replace(/^Status:/, '')}
                      </a>
                    </td>
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title)}`}
                        target="_blank"
                        className="text-purple-600 hover:underline"
                      >
                        {page.title}
                      </a>
                    </td>
                    <td className="p-3 border text-sm text-gray-600">
                      {new Date(page.timestamp).toLocaleString('zh-CN')}
                    </td>
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title)}?action=delete`}
                        target="_blank"
                        className="text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                      >
                        删除
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 孤立 Status 页面 */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-purple-800">👻 孤立 Status 页面</h2>
          <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
            共 {data.orphanedStatus.length} 个
          </span>
        </div>
        {data.orphanedStatus.length === 0 ? (
          <p className="text-gray-500">没有孤立 Status 页面 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded-lg">
              <thead className="bg-purple-50">
                <tr>
                  <th className="text-left p-3 border">Status 页面</th>
                  <th className="text-left p-3 border">原属主页面</th>
                  <th className="text-left p-3 border">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.orphanedStatus.map((page) => (
                  <tr key={page.pageid} className="hover:bg-gray-50">
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title)}`}
                        target="_blank"
                        className="text-purple-600 hover:underline"
                      >
                        {page.title}
                      </a>
                    </td>
                    <td className="p-3 border text-gray-500">
                      {page.title.replace(/^Status:/, '')}（已不存在）
                    </td>
                    <td className="p-3 border">
                      <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-sm">
                        孤立
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
