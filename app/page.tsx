'use client';

import { useEffect, useState } from 'react';

interface PageInfo {
  pageid: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;
  mainTitle: string;
  statusTimestamp: string;
  mainTimestamp: string | null;
}

interface PendingPageInfo {
  pageid: number;
  title: string;
  mainTitle: string;
  statusTimestamp: string;
  note: string;
}

interface AuditData {
  unreviewed: PageInfo[];
  unreviewedRedirects: PageInfo[];
  failed: FailedPageInfo[];
  orphanedStatus: PageInfo[];
  pending: PendingPageInfo[];
}

export default function Home() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/audit', { cache: 'no-store' })
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

  const getActionStatus = (
    item: FailedPageInfo
  ): '需要删除' | '需要重审' | '立即重审' | '等待修改' => {
    const now = Date.now();
    const mainEdited = item.mainTimestamp
      ? new Date(item.mainTimestamp).getTime()
      : 0;
    const statusTime = new Date(item.statusTimestamp).getTime();
    const diffDays = (now - statusTime) / (1000 * 60 * 60 * 24);

    if (mainEdited < statusTime) {
      if (diffDays > 15) return '需要删除';
      return '等待修改';
    }

    if (diffDays <= 30) return '需要重审';
    return '立即重审';
  };

  const getNoteLabel = (note: string) => {
    const normalized = note.trim().toLowerCase();
    if (normalized === 'pass') {
      return (
        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-sm">
          偏向Pass
        </span>
      );
    }
    if (normalized === 'fail') {
      return (
        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-sm">
          偏向Fail
        </span>
      );
    }
    if (!note) {
      return (
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-sm">
          暂无偏向
        </span>
      );
    }
    return (
      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-sm">
        有其他备注
      </span>
    );
  };

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
        <a
          href="https://backroomszh.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://static.miraheze.org/backroomszhwiki/1/16/SiteLogo.png"
            alt="Site Logo"
            className="h-24 mx-auto mb-4"
          />
        </a>
        <h1 className="text-3xl font-bold mb-6">审核管理面板</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-left max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-amber-800 mb-3">
            审核与删除要求
          </h2>
          <p className="text-amber-900 leading-relaxed">
            被标注Fail的文章将从被标注的日期开始算起，若15天内无修改，则可以由站务组在15天以后直接删除。若15天内有修改却没有使其达到通过审核的标准，则延期至30天。只要删除以前进行的修改使文章达到了Pass的标准，审核者则应该将其状态更换为Pass。在删除文章的时候，删除者应当对文章进行复审，以免误删。
          </p>
        </div>
        <div className="mt-4 flex justify-center gap-4">
          <a
            href="https://backroomszh.org"
            className="text-blue-600 hover:underline font-medium"
          >
            ← 返回主页
          </a>
          <a
            href="/api/audit"
            target="_blank"
            className="bg-gray-800 text-white px-4 py-1 rounded-full text-sm hover:bg-gray-700"
          >
            🤖 JSON API
          </a>
        </div>
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

      {/* 未审核重定向页面（新增） */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-teal-800">
            ↪️ 未审核重定向页面
          </h2>
          <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-sm">
            共 {data.unreviewedRedirects.length} 个
          </span>
        </div>
        {data.unreviewedRedirects.length === 0 ? (
          <p className="text-gray-500">暂无未审核重定向页面 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded-lg">
              <thead className="bg-teal-50">
                <tr>
                  <th className="text-left p-3 border">重定向页面</th>
                  <th className="text-left p-3 border">Status 页面</th>
                  <th className="text-left p-3 border">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.unreviewedRedirects.map((page) => (
                  <tr key={page.pageid} className="hover:bg-gray-50">
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.title)}?redirect=no`}
                        target="_blank"
                        className="text-teal-700 hover:underline"
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
                  <th className="text-left p-3 border">状态</th>
                  <th className="text-left p-3 border">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.failed.map((page) => {
                  const actionStatus = getActionStatus(page);
                  return (
                    <tr key={page.pageid} className="hover:bg-gray-50">
                      <td className="p-3 border">
                        <a
                          href={`https://wiki.backroomszh.org/${encodeURIComponent(page.mainTitle)}`}
                          target="_blank"
                          className="text-blue-600 hover:underline"
                        >
                          {page.mainTitle}
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
                        {new Date(page.statusTimestamp).toLocaleString('zh-CN')}
                      </td>
                      <td className="p-3 border">
                        {actionStatus === '需要删除' ? (
                          <span className="text-white bg-red-600 px-2 py-0.5 rounded text-sm font-bold">
                            需要删除
                          </span>
                        ) : actionStatus === '需要重审' ? (
                          <span className="text-white bg-orange-500 px-2 py-0.5 rounded text-sm font-bold">
                            需要重审
                          </span>
                        ) : actionStatus === '立即重审' ? (
                          <span className="text-white bg-orange-600 px-2 py-0.5 rounded text-sm font-bold">
                            立即重审
                          </span>
                        ) : (
                          <span className="text-orange-700 bg-orange-50 px-2 py-0.5 rounded text-sm">
                            等待修改
                          </span>
                        )}
                      </td>
                      <td className="p-3 border">
                        <div className="flex items-center space-x-2">
                          <a
                            href={`https://wiki.backroomszh.org/${encodeURIComponent(page.mainTitle)}?action=delete`}
                            target="_blank"
                            className="text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                          >
                            删除
                          </a>
                          <a
                            href={`https://wiki.backroomszh.org/Special:MovePage/${encodeURIComponent(page.mainTitle)}`}
                            target="_blank"
                            className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                          >
                            移动
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 需要进一步审核 */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-amber-800">
            🔍 需要进一步审核
          </h2>
          <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm">
            共 {data.pending.length} 个
          </span>
        </div>
        {data.pending.length === 0 ? (
          <p className="text-gray-500">暂无需要进一步审核的页面 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded-lg">
              <thead className="bg-amber-50">
                <tr>
                  <th className="text-left p-3 border">主页面</th>
                  <th className="text-left p-3 border">Status 页面</th>
                  <th className="text-left p-3 border">最近更新</th>
                  <th className="text-left p-3 border">偏向</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((page) => (
                  <tr key={page.pageid} className="hover:bg-gray-50">
                    <td className="p-3 border">
                      <a
                        href={`https://wiki.backroomszh.org/${encodeURIComponent(page.mainTitle)}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        {page.mainTitle}
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
                      {new Date(page.statusTimestamp).toLocaleString('zh-CN')}
                    </td>
                    <td className="p-3 border">{getNoteLabel(page.note)}</td>
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
          <h2 className="text-2xl font-semibold text-purple-800">
            👻 孤立 Status 页面
          </h2>
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
                  <th className="text-left p-3 border">操作</th>
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
    </div>
  );
}
