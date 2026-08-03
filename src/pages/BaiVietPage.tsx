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
import { ArrowLeft, ArrowRight, CalendarDays, Newspaper, Sparkles } from 'lucide-react'

const timestamp = (date: string) => ({ toMillis: () => new Date(`${date}T08:00:00+07:00`).getTime() })

const DEFAULT_EDITORIAL_POSTS: SitePost[] = [
  {
    id: 'brand-award-2026',
    slug: 'dau-an-thuong-hieu-giao-duc-2026',
    title: 'Dấu ấn 123English trong hành trình xây dựng thương hiệu giáo dục',
    excerpt:
      'Những hình ảnh tại chương trình vinh danh năm 2026 ghi lại một cột mốc đáng nhớ trên hành trình phát triển của 123English.',
    body:
      'Mỗi sự ghi nhận là một dịp để 123English nhìn lại chặng đường đã đi qua và tiếp tục hoàn thiện trải nghiệm học tập.\n\nVới 123English, thành tựu không chỉ nằm ở hình ảnh trên sân khấu. Thành tựu còn là khi một học viên dám nói câu tiếng Anh đầu tiên, tự tin giao tiếp hơn, vượt qua nỗi sợ mắc lỗi và mở ra một cơ hội mới cho bản thân.\n\nCột mốc năm 2026 tiếp thêm động lực để đội ngũ tiếp tục đầu tư vào phương pháp giảng dạy, chất lượng gia sư, công nghệ theo dõi tiến độ và sự đồng hành cùng từng gia đình.',
    coverImage: '/brand-national-award-2026.jpg',
    category: 'Dấu ấn 2026',
    author: '123English',
    published: true,
    createdAt: timestamp('2026-07-25'),
  },
  {
    id: 'the-world-2026',
    slug: '2026-ket-noi-voi-thi-truong-quoc-te',
    title: '2026 | Kết nối với thị trường quốc tế',
    excerpt:
      '123English bước vào giai đoạn phát triển mới, kết nối người học với gia sư, kiến thức và cơ hội.',
    body:
      '123English bắt đầu bước vào một giai đoạn phát triển mới.\n\nKhông chỉ xây dựng hệ thống dành cho người học trong nước, 123English hướng tới việc kết nối với thị trường quốc tế.\n\nKết nối người học với gia sư.\nKết nối kiến thức với cơ hội.\nKết nối những con người khác nhau bằng một ngôn ngữ chung.\n\nHành trình học tiếng Anh không kết thúc khi người học hoàn thành một khóa học. Hành trình ấy thực sự bắt đầu khi người học có thể sử dụng tiếng Anh để đi xa hơn.',
    coverImage: '/brand-award-recipient-2026.jpg',
    category: 'Hành trình phát triển',
    author: '123English',
    published: true,
    createdAt: timestamp('2026-01-12'),
  },
  {
    id: 'expansion-2025',
    slug: '2025-mo-rong-he-thong',
    title: '2025 | Mở rộng hệ thống',
    excerpt:
      'Chương trình, công nghệ, đội ngũ và quy trình vận hành được đầu tư để tạo ra trải nghiệm học tập nhất quán.',
    body:
      '123English tiếp tục mở rộng quy mô hoạt động và hoàn thiện hệ thống đào tạo.\n\nCác chương trình học được phát triển theo nhiều nhu cầu, từ xây dựng nền tảng đến giao tiếp thực tế và phát triển năng lực tiếng Anh chuyên sâu.\n\nCùng với đó, công nghệ, đội ngũ và quy trình vận hành tiếp tục được đầu tư để tạo ra một trải nghiệm học tập nhất quán và có khả năng mở rộng.\n\nBuild better.\nLearn further.\nGrow together.',
    coverImage: '/home-quality-review-2026.png',
    category: 'Hành trình phát triển',
    author: '123English',
    published: true,
    createdAt: timestamp('2025-08-18'),
  },
  {
    id: 'milestone-2024',
    slug: '2024-cot-moc-1000-hoc-vien',
    title: '2024 | Cột mốc 1.000 học viên',
    excerpt:
      'Đằng sau con số 1.000 là 1.000 điểm bắt đầu, 1.000 mục tiêu và hàng nghìn giờ học tập.',
    body:
      '123English chạm mốc 1.000 học viên.\n\nĐằng sau con số đó là 1.000 hành trình học tập khác nhau.\n\n1.000 điểm bắt đầu.\n1.000 mục tiêu.\nVà hàng nghìn giờ học, thực hành và tiến bộ.\n\nCột mốc này đánh dấu sự tin tưởng của cộng đồng người học dành cho 123English, đồng thời trở thành động lực để đội ngũ tiếp tục phát triển.',
    coverImage: '/home-teacher-student-2026.png',
    category: 'Hành trình phát triển',
    author: '123English',
    published: true,
    createdAt: timestamp('2024-09-05'),
  },
  {
    id: 'ecosystem-2023',
    slug: '2023-kien-tao-he-sinh-thai',
    title: '2023 | Kiến tạo hệ sinh thái',
    excerpt:
      'Từ một phương pháp giảng dạy, 123English bắt đầu phát triển thành một hệ thống giáo dục toàn diện.',
    body:
      'Từ một phương pháp giảng dạy, 123English bắt đầu phát triển thành một hệ thống giáo dục toàn diện hơn.\n\nChương trình học, đội ngũ gia sư, quy trình đào tạo và công nghệ được từng bước kết nối để tạo nên một hệ sinh thái học tập thống nhất.\n\nĐây là giai đoạn 123English chuyển mình: từ một chương trình học trở thành một hệ thống giáo dục.',
    coverImage: '/home-international-team-2026.png',
    category: 'Hành trình phát triển',
    author: '123English',
    published: true,
    createdAt: timestamp('2023-06-21'),
  },
  {
    id: 'method-2022',
    slug: '2022-dinh-hinh-phuong-phap',
    title: '2022 | Định hình phương pháp',
    excerpt:
      '123 Teaching Method™ được xây dựng trên ba nguyên tắc: tập trung, tương tác và thực hành.',
    body:
      'Sau quá trình nghiên cứu và phát triển, 123 Teaching Method™ được hình thành.\n\nPhương pháp học tập được xây dựng trên ba nguyên tắc:\n\nTập trung vào một trọng tâm.\nTương tác thông qua trò chơi.\nThực hành ngay trong lớp học.\n\nĐây trở thành nền tảng trong cách 123English thiết kế bài học và xây dựng trải nghiệm học tập.',
    coverImage: '/brand-online-class-2026.jpg',
    category: 'Phương pháp',
    author: '123English',
    published: true,
    createdAt: timestamp('2022-05-10'),
  },
  {
    id: 'beginning-2021',
    slug: '2021-khoi-nguon',
    title: '2021 | Khởi nguồn',
    excerpt:
      'Một hệ thống giáo dục tiếng Anh thực tế, dễ tiếp cận và lấy người học làm trung tâm bắt đầu được hình thành.',
    body:
      '123English chính thức được hình thành với một định hướng rõ ràng:\n\nXây dựng một hệ thống giáo dục tiếng Anh thực tế, dễ tiếp cận và lấy người học làm trung tâm.\n\nTừ những bước đầu tiên, 123English bắt đầu đặt nền móng cho một hành trình dài hơn, nơi tiếng Anh không chỉ được học trong sách vở mà được sử dụng như một công cụ để kết nối với thế giới.',
    coverImage: '/brand-online-class-2026.jpg',
    category: 'Khởi nguồn',
    author: '123English',
    published: true,
    createdAt: timestamp('2021-03-15'),
  },
]

function usePublishedPosts() {
  const [posts, setPosts] = useState<SitePost[]>(DEFAULT_EDITORIAL_POSTS)
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
        const remoteSlugs = new Set(list.map((post) => post.slug))
        setPosts([...list, ...DEFAULT_EDITORIAL_POSTS.filter((post) => !remoteSlugs.has(post.slug))])
        setLoading(false)
      },
      (err) => {
        console.warn('[posts] không đọc được:', err?.message)
        setPosts(DEFAULT_EDITORIAL_POSTS)
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
        <section className="px-5 pb-8 pt-12 sm:px-8 lg:px-12 lg:pb-12 lg:pt-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">
                <Sparkles className="h-4 w-4" />
                Góc chia sẻ 123English
              </p>
              <h1 className="mt-4 max-w-3xl text-[clamp(2.7rem,5.4vw,5.2rem)] font-black leading-[0.98] tracking-[-0.055em] text-[#10213A]">
                Một hành trình.<br />
                Nhiều câu chuyện đáng nhớ.
              </h1>
            </div>
            <p className="max-w-xl border-l-4 border-[#FFC107] pl-5 text-base font-semibold leading-8 text-slate-600">
              Từ khởi nguồn, phương pháp đến những cột mốc phát triển, mỗi bài viết lưu lại một phần hành trình của 123English và cộng đồng người học.
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
