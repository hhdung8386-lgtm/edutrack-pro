import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowRight } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { SitePost } from '@/lib/siteContent'

interface NewsItem {
  id: string
  slug: string
  title: string
  createdAt: number
}

const NEWS_CACHE_KEY = '123english_latest_news_v1'
const NEWS_CACHE_MS = 10 * 60 * 1000

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'brand-award-2026',
    slug: 'dau-an-thuong-hieu-giao-duc-2026',
    title: 'Dấu ấn 123English trong hành trình xây dựng thương hiệu giáo dục',
    createdAt: new Date('2026-07-25T08:00:00+07:00').getTime(),
  },
  {
    id: 'the-world-2026',
    slug: '2026-ket-noi-voi-thi-truong-quoc-te',
    title: '2026 | Kết nối với thị trường quốc tế',
    createdAt: new Date('2026-01-12T08:00:00+07:00').getTime(),
  },
  {
    id: 'expansion-2025',
    slug: '2025-mo-rong-he-thong',
    title: '2025 | Mở rộng hệ thống',
    createdAt: new Date('2025-08-18T08:00:00+07:00').getTime(),
  },
  {
    id: 'milestone-2024',
    slug: '2024-cot-moc-1000-hoc-vien',
    title: '2024 | Cột mốc 1.000 học viên',
    createdAt: new Date('2024-09-05T08:00:00+07:00').getTime(),
  },
]

function postTimestamp(value: unknown) {
  return (value as { toMillis?: () => number } | undefined)?.toMillis?.() || 0
}

function formatNewsDate(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function readNewsCache(): NewsItem[] | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(NEWS_CACHE_KEY) || 'null') as {
      expiresAt?: number
      items?: NewsItem[]
    } | null
    return cached && Number(cached.expiresAt) > Date.now() && Array.isArray(cached.items)
      ? cached.items
      : null
  } catch {
    return null
  }
}

function writeNewsCache(items: NewsItem[]) {
  try {
    sessionStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({
      expiresAt: Date.now() + NEWS_CACHE_MS,
      items,
    }))
  } catch {
    // Storage may be unavailable in privacy mode; the in-memory UI still works.
  }
}

export function LatestNewsSection() {
  const [items, setItems] = useState<NewsItem[]>(() => readNewsCache() || FALLBACK_NEWS)

  useEffect(() => {
    const cached = readNewsCache()
    if (cached) return

    let active = true
    getDocs(query(collection(db, 'posts'), where('published', '==', true)))
      .then((snapshot) => {
        if (!active) return
        const remoteItems = snapshot.docs.map((document) => {
          const post = { id: document.id, ...document.data() } as SitePost
          return {
            id: post.id,
            slug: post.slug || post.id,
            title: post.title,
            createdAt: postTimestamp(post.createdAt),
          }
        })
        const remoteSlugs = new Set(remoteItems.map((item) => item.slug))
        const merged = [...remoteItems, ...FALLBACK_NEWS.filter((item) => !remoteSlugs.has(item.slug))]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 4)
        setItems(merged)
        writeNewsCache(merged)
      })
      .catch(() => {
        if (active) setItems(FALLBACK_NEWS)
      })

    return () => { active = false }
  }, [])

  return (
    <section className="bg-[#F5F6F7] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24" aria-labelledby="latest-news-title">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-20">
        <div className="lg:pt-1">
          <h2 id="latest-news-title" className="max-w-[8ch] text-4xl font-black leading-[1.05] tracking-[-0.04em] text-[#10213A] sm:text-5xl">
            Tin tức mới nhất
          </h2>
          <Link
            to="/bai-viet"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#FFC107] px-6 text-sm font-extrabold text-[#10213A] transition hover:bg-[#FFB300] active:translate-y-px focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
          >
            Đọc thêm
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="border-t border-slate-300/70">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/bai-viet/${item.slug}`}
              className="group grid gap-2 border-b border-slate-300/70 py-6 transition-colors hover:text-[#0E7EBA] sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-5"
            >
              <time dateTime={new Date(item.createdAt).toISOString()} className="text-sm font-semibold tabular-nums text-slate-500">
                {formatNewsDate(item.createdAt)}
              </time>
              <span className="flex items-center justify-between gap-4 text-base font-bold leading-6 text-[#10213A] transition-colors group-hover:text-[#0E7EBA]">
                <span>{item.title}</span>
                <ArrowRight className="h-4 w-4 flex-none translate-x-0 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
