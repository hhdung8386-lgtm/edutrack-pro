/**
 * Trang Bài viết (public) — danh sách và chi tiết bài viết do admin đăng trong CMS.
 * Không có bài nào thì hiển thị trạng thái trống lịch sự, không vỡ trang.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import type { SitePost } from '@/lib/siteContent'
import { ArrowLeft, ArrowRight, CalendarDays, Newspaper } from 'lucide-react'

function usePublishedPosts() {
  const [posts, setPosts] = useState<SitePost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'posts'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SitePost))
        list.sort((a, b) => {
          const av = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0
          const bv = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0
          return bv - av
        })
        setPosts(list)
        setLoading(false)
      },
      (err) => {
        console.warn('[posts] không đọc được:', err?.message)
        setPosts([])
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return { posts, loading }
}

function formatDate(value: unknown) {
  const millis = (value as { toMillis?: () => number } | undefined)?.toMillis?.()
  if (!millis) return ''
  return new Date(millis).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function BaiVietPage() {
  const { posts, loading } = usePublishedPosts()
  const [featured, ...rest] = posts

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <PublicNav />

      <main className="flex-1">
        {/* Tiêu đề trang */}
        <section className="px-5 pb-6 pt-12 sm:px-8 lg:px-12 lg:pt-16">
          <div className="mx-auto w-full max-w-7xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">Góc chia sẻ 123English</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.12] tracking-tight text-[#10213A] sm:text-4xl lg:text-5xl">
              Bài viết &amp; kinh nghiệm học tiếng Anh
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
              Phương pháp học, lộ trình và câu chuyện thật từ học viên — được đội ngũ 123English tổng hợp.
            </p>
          </div>
        </section>

        {loading ? (
          <section className="px-5 pb-16 sm:px-8 lg:px-12">
            <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-72 animate-pulse rounded-[1.75rem] bg-slate-100" />
              ))}
            </div>
          </section>
        ) : posts.length === 0 ? (
          <section className="px-5 pb-20 sm:px-8 lg:px-12">
            <div className="mx-auto w-full max-w-7xl rounded-[2rem] border-2 border-dashed border-slate-200 py-20 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-base font-bold text-slate-700">Chưa có bài viết nào</p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Nội dung đang được chuẩn bị, mời bạn quay lại sau.
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* Bài nổi bật */}
            {featured && (
              <section className="px-5 pb-10 sm:px-8 lg:px-12">
                <Link
                  to={`/bai-viet/${featured.slug || featured.id}`}
                  className="mx-auto grid w-full max-w-7xl gap-7 overflow-hidden rounded-[2.25rem] bg-[#F6F7F9] p-6 transition hover:shadow-[0_24px_60px_-34px_rgba(15,35,60,0.4)] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:p-10"
                >
                  <div>
                    {featured.category && (
                      <span className="inline-flex rounded-full bg-[#FFF4C7] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#A76500]">
                        {featured.category}
                      </span>
                    )}
                    <h2 className="mt-4 text-2xl font-black leading-[1.2] tracking-[-0.03em] text-[#10213A] sm:text-3xl">
                      {featured.title}
                    </h2>
                    {featured.excerpt && (
                      <p className="mt-3 text-base font-medium leading-7 text-slate-600">{featured.excerpt}</p>
                    )}
                    <div className="mt-5 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                      {featured.author && <span>{featured.author}</span>}
                      {formatDate(featured.createdAt) && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(featured.createdAt)}
                        </span>
                      )}
                    </div>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-[#0E7EBA]">
                      Đọc bài viết
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  {featured.coverImage && (
                    <img
                      src={featured.coverImage}
                      alt={featured.title}
                      loading="lazy"
                      style={{ aspectRatio: '4 / 3' }}
                      className="w-full rounded-[1.75rem] object-cover"
                    />
                  )}
                </Link>
              </section>
            )}

            {/* Danh sách còn lại */}
            {rest.length > 0 && (
              <section className="px-5 pb-20 sm:px-8 lg:px-12">
                <div className="mx-auto grid w-full max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <Link
                      key={post.id}
                      to={`/bai-viet/${post.slug || post.id}`}
                      className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-[0_20px_50px_-30px_rgba(15,35,60,0.4)]"
                    >
                      {post.coverImage ? (
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          loading="lazy"
                          style={{ aspectRatio: '16 / 10' }}
                          className="w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center bg-[#F6F7F9]">
                          <Newspaper className="h-8 w-8 text-slate-300" />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col p-5">
                        {post.category && (
                          <span className="mb-2 inline-flex w-fit rounded-full bg-[#E8F7FD] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0E7EBA]">
                            {post.category}
                          </span>
                        )}
                        <h3 className="text-base font-black leading-6 text-[#10213A] group-hover:text-[#0E7EBA]">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-slate-500">{post.excerpt}</p>
                        )}
                        <div className="mt-auto pt-4 text-xs font-semibold text-slate-400">
                          {formatDate(post.createdAt)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  )
}

/** Chi tiết một bài viết. */
export function BaiVietChiTietPage() {
  const { slug } = useParams<{ slug: string }>()
  const { posts, loading } = usePublishedPosts()
  const post = useMemo(() => posts.find((p) => p.slug === slug || p.id === slug), [posts, slug])

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <PublicNav />

      <main className="flex-1 px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            to="/bai-viet"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-500 transition-colors hover:text-[#0E7EBA]"
          >
            <ArrowLeft className="h-4 w-4" />
            Tất cả bài viết
          </Link>

          {loading ? (
            <div className="mt-8 space-y-4">
              <div className="h-10 w-3/4 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-64 animate-pulse rounded-[1.75rem] bg-slate-100" />
            </div>
          ) : !post ? (
            <div className="mt-10 rounded-[2rem] border-2 border-dashed border-slate-200 py-20 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-base font-bold text-slate-700">Không tìm thấy bài viết</p>
              <p className="mt-1 text-sm font-medium text-slate-500">Bài viết có thể đã được gỡ hoặc đổi đường dẫn.</p>
            </div>
          ) : (
            <article className="mt-7">
              {post.category && (
                <span className="inline-flex rounded-full bg-[#FFF4C7] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#A76500]">
                  {post.category}
                </span>
              )}
              <h1 className="mt-4 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#10213A] sm:text-4xl">
                {post.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                {post.author && <span>{post.author}</span>}
                {formatDate(post.createdAt) && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(post.createdAt)}
                  </span>
                )}
              </div>

              {post.coverImage && (
                <img
                  src={post.coverImage}
                  alt={post.title}
                  style={{ aspectRatio: '16 / 9' }}
                  className="mt-7 w-full rounded-[1.75rem] object-cover"
                />
              )}

              {post.excerpt && (
                <p className="mt-7 border-l-4 border-[#FFC107] pl-5 text-base font-semibold leading-7 text-slate-700">
                  {post.excerpt}
                </p>
              )}

              <div className="mt-7 whitespace-pre-line text-base font-medium leading-8 text-slate-700">
                {post.body}
              </div>
            </article>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
