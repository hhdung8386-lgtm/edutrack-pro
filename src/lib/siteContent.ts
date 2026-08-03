/**
 * Lớp dữ liệu cho CMS nội dung trang public (Trang chủ, Chương trình học, Liên hệ, Bài viết).
 *
 * NGUYÊN TẮC AN TOÀN:
 * - Trang public LUÔN có nội dung mặc định trong mã nguồn. Firestore chỉ để GHI ĐÈ.
 *   Nếu chưa có dữ liệu / mất mạng / thiếu quyền -> vẫn hiển thị bản mặc định, không vỡ trang.
 * - Không xoá field lạ: khi lưu, chỉ ghi đúng các khối admin đang chỉnh.
 * - Mọi thay đổi đọc theo thời gian thực (onSnapshot) nên admin sửa là trang public đổi ngay.
 */
import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { compressImage } from '@/lib/imageUploader'

/** Các trang được quản lý nội dung. */
export type SitePageId = 'home' | 'curriculum' | 'contact'

export const SITE_PAGES: { id: SitePageId; label: string; path: string; description: string }[] = [
  { id: 'home', label: 'Trang chủ', path: '/login', description: 'Trang khách nhìn thấy đầu tiên' },
  { id: 'curriculum', label: 'Chương trình học', path: '/chuong-trinh-hoc', description: 'Giới thiệu lộ trình và giáo trình' },
  { id: 'contact', label: 'Liên hệ', path: '/lien-he', description: 'Thông tin liên hệ và tư vấn' },
]

/** Kiểu khối nội dung admin có thể thêm/sửa/sắp xếp. */
export type SiteBlockType = 'hero' | 'featureList' | 'imageText' | 'stats' | 'cta' | 'richText'

export const BLOCK_TYPE_META: Record<SiteBlockType, { label: string; hint: string }> = {
  hero: { label: 'Khối mở đầu', hint: 'Tiêu đề lớn, mô tả, ảnh và nút hành động' },
  featureList: { label: 'Danh sách điểm mạnh', hint: 'Nhiều mục nhỏ có tiêu đề và mô tả' },
  imageText: { label: 'Ảnh kèm nội dung', hint: 'Một ảnh bên cạnh đoạn văn' },
  stats: { label: 'Số liệu nổi bật', hint: 'Các con số gây ấn tượng' },
  cta: { label: 'Kêu gọi hành động', hint: 'Dải mời đăng ký / liên hệ' },
  richText: { label: 'Đoạn văn bản', hint: 'Tiêu đề và nội dung tự do' },
}

export interface SiteBlockItem {
  id: string
  title: string
  description: string
  /** Ảnh minh hoạ tuỳ chọn cho từng mục. */
  image?: string
}

export interface SiteBlock {
  id: string
  type: SiteBlockType
  /** Tắt khối mà không cần xoá — an toàn hơn cho vận hành. */
  enabled: boolean
  eyebrow?: string
  title?: string
  subtitle?: string
  body?: string
  image?: string
  /** Ảnh nằm bên trái hay phải (khối imageText). */
  imagePosition?: 'left' | 'right'
  ctaLabel?: string
  ctaHref?: string
  items?: SiteBlockItem[]
}

export interface SitePageContent {
  blocks: SiteBlock[]
  updatedAt?: unknown
  updatedBy?: string
}

export function createBlockId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Khối trống theo từng loại — dùng khi admin bấm "Thêm khối". */
export function createEmptyBlock(type: SiteBlockType): SiteBlock {
  const base: SiteBlock = { id: createBlockId(), type, enabled: true }
  switch (type) {
    case 'hero':
      return { ...base, eyebrow: 'Giới thiệu', title: 'Tiêu đề nổi bật', subtitle: 'Mô tả ngắn cho phần mở đầu.', ctaLabel: 'Tìm hiểu thêm', ctaHref: '#' }
    case 'featureList':
      return {
        ...base,
        title: 'Điểm mạnh của chúng tôi',
        items: [
          { id: createBlockId(), title: 'Ưu điểm 1', description: 'Mô tả ngắn gọn.' },
          { id: createBlockId(), title: 'Ưu điểm 2', description: 'Mô tả ngắn gọn.' },
        ],
      }
    case 'imageText':
      return { ...base, title: 'Tiêu đề', body: 'Nội dung mô tả chi tiết.', imagePosition: 'right' }
    case 'stats':
      return {
        ...base,
        title: 'Những con số nổi bật',
        items: [
          { id: createBlockId(), title: '10.000+', description: 'học viên đã đồng hành' },
          { id: createBlockId(), title: '98%', description: 'phụ huynh hài lòng' },
        ],
      }
    case 'cta':
      return { ...base, title: 'Bắt đầu hành trình cùng 123English', subtitle: 'Để lại thông tin để được tư vấn lộ trình phù hợp.', ctaLabel: 'Nhận tư vấn', ctaHref: '/lien-he' }
    case 'richText':
    default:
      return { ...base, title: 'Tiêu đề', body: 'Nội dung...' }
  }
}

/**
 * Nội dung mặc định của từng trang. Đây là "nguồn dự phòng" — public page dùng
 * bản này khi Firestore chưa có dữ liệu, nên không bao giờ trắng trang.
 */
export const DEFAULT_CONTENT: Record<SitePageId, SitePageContent> = {
  home: {
    blocks: [
      {
        id: 'home-quality',
        type: 'hero',
        enabled: true,
        eyebrow: 'Đội ngũ gia sư tâm huyết & chuyên nghiệp',
        title: 'Nâng tầm\nchất lượng giáo dục',
        subtitle:
          'Gia sư 123English luôn biết cách khơi gợi sự tò mò và xây dựng sự tự tin cho học viên. Với bề dày kinh nghiệm và lòng yêu nghề, thầy cô giúp học viên tận hưởng niềm vui học tập và giao tiếp tiếng Anh một cách tự nhiên, trôi chảy.',
        image: '/home-teacher-student-2026.png',
        ctaLabel: 'Tra cứu tiến độ',
        ctaHref: '#tra-cuu',
      },
      {
        id: 'home-standards',
        type: 'featureList',
        enabled: true,
        eyebrow: 'Chỉ 3% ứng viên trở thành gia sư của 123English',
        title: 'Tiêu chuẩn tuyển chọn khắt khe',
        image: '/home-teacher-selection-2026.png',
        imagePosition: 'left',
        items: [
          { id: 'std-1', title: 'Phát âm chuẩn bản xứ', description: 'Phát âm chuẩn xác và am hiểu ngữ cảnh văn hoá.' },
          { id: 'std-2', title: 'Bằng cấp chuyên môn đạt chuẩn', description: 'Yêu cầu bằng Cử nhân chuyên ngành Sư phạm hoặc Tiếng Anh.' },
          { id: 'std-3', title: 'Chứng chỉ giảng dạy chuyên nghiệp', description: 'Sở hữu chứng chỉ TESOL, TEFL hoặc CELTA.' },
          { id: 'std-4', title: 'Kinh nghiệm giảng dạy thực tế', description: 'Trên 2 năm kinh nghiệm dạy tiếng Anh đa quốc gia với kỹ năng sư phạm vững vàng.' },
        ],
      },
      {
        id: 'home-guarantee',
        type: 'featureList',
        enabled: true,
        title: 'Luôn duy trì chất lượng gia sư xuất sắc',
        image: '/home-quality-review-2026.png',
        imagePosition: 'right',
        items: [
          { id: 'gr-1', title: 'Dự giờ & kiểm định lớp học', description: 'Đội ngũ chuyên môn kiểm tra ngẫu nhiên các lớp học trực tuyến để đảm bảo chất lượng giảng dạy của gia sư.' },
          { id: 'gr-2', title: 'Phản hồi từ học viên và phụ huynh', description: 'Sau mỗi buổi học, chúng tôi đều thu thập ý kiến từ học viên và phụ huynh để theo dõi và nâng cao chất lượng giảng dạy.' },
          { id: 'gr-3', title: 'Nâng cao chuyên môn', description: 'Gia sư tham gia các khoá đào tạo hằng tháng để cập nhật phương pháp mới và hoàn thiện kỹ năng giảng dạy.' },
        ],
      },
      {
        id: 'home-global',
        type: 'imageText',
        enabled: true,
        title: 'Đội ngũ gia sư quốc tế thấu hiểu tâm lý trẻ',
        body:
          'Với đội ngũ gia sư đến từ Việt Nam, Philippines và nhiều quốc gia khác, 123English mang đến những gia sư không chỉ giỏi chuyên môn mà còn am hiểu đa văn hoá. Thầy cô luôn biết cách kết nối và điều chỉnh phương pháp dạy phù hợp nhất với tính cách của mỗi học viên.',
        image: '/home-international-team-2026.png',
        imagePosition: 'right',
        ctaLabel: 'Bắt đầu ngay',
        ctaHref: '#tra-cuu',
      },
      {
        id: 'home-companion',
        type: 'imageText',
        enabled: true,
        title: 'Hơn cả gia sư — là người bạn đồng hành',
        body:
          'Tại 123English, gia sư không chỉ truyền tải kiến thức mà còn xây dựng niềm tin, khích lệ và trở thành người bạn đồng hành thực thụ trên hành trình học tập của con. Từ những bước đầu tiên đến các khoảnh khắc bứt phá, thầy cô luôn ở đó để truyền động lực, hỗ trợ và cùng con ăn mừng mỗi bước tiến mới.',
        image: '/home-learning-companion-2026.png',
        imagePosition: 'left',
      },
    ],
  },
  curriculum: {
    blocks: [
      {
        id: 'cur-hero',
        type: 'hero',
        enabled: true,
        eyebrow: 'Chương trình học 123English',
        title: 'Chọn đúng giáo trình cho từng chặng tiến bộ.',
        subtitle: '9 cấp độ rõ ràng, 16 giáo trình và lộ trình phù hợp cho từng độ tuổi.',
        ctaLabel: 'Xem bản đồ giáo trình',
        ctaHref: '#ban-do-giao-trinh',
      },
      {
        id: 'cur-intro',
        type: 'richText',
        enabled: false,
        title: 'Giới thiệu thêm về chương trình',
        body: 'Bật khối này để bổ sung nội dung tuỳ ý bên dưới bản đồ giáo trình.',
      },
    ],
  },
  contact: {
    blocks: [
      {
        id: 'contact-hero',
        type: 'hero',
        enabled: true,
        eyebrow: 'Liên hệ với chúng tôi',
        title: 'Chúng tôi luôn sẵn sàng đồng hành cùng bạn',
        subtitle:
          'Nếu bạn có câu hỏi hoặc cần tư vấn chương trình học, đội ngũ 123English luôn sẵn lòng hỗ trợ nhanh chóng và tận tâm.',
        image: '/lienhe.png',
      },
      {
        id: 'contact-cta',
        type: 'cta',
        enabled: false,
        title: 'Cần tư vấn lộ trình phù hợp?',
        subtitle: 'Để lại thông tin, đội ngũ 123English sẽ liên hệ trong 24 giờ.',
        ctaLabel: 'Liên hệ ngay',
        ctaHref: '/lien-he',
      },
    ],
  },
}

/** Đọc nội dung một trang theo thời gian thực; luôn có bản mặc định để dự phòng. */
export function useSiteContent(pageId: SitePageId) {
  const [content, setContent] = useState<SitePageContent>(DEFAULT_CONTENT[pageId])
  const [loading, setLoading] = useState(true)
  /** true = đang dùng bản mặc định trong mã nguồn (chưa có dữ liệu trên Firestore). */
  const [usingDefault, setUsingDefault] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'siteContent', pageId),
      (snap) => {
        const data = snap.data() as SitePageContent | undefined
        if (snap.exists() && Array.isArray(data?.blocks)) {
          setContent({ ...data, blocks: data.blocks })
          setUsingDefault(false)
        } else {
          setContent(DEFAULT_CONTENT[pageId])
          setUsingDefault(true)
        }
        setLoading(false)
      },
      (err) => {
        // Không có quyền / mất mạng -> giữ bản mặc định, trang vẫn hiển thị bình thường.
        console.warn('[siteContent] fallback to default:', err?.message)
        setContent(DEFAULT_CONTENT[pageId])
        setUsingDefault(true)
        setLoading(false)
      }
    )
    return unsub
  }, [pageId])

  return { content, loading, usingDefault }
}

/** Lưu nội dung trang (chỉ admin). merge:true để không xoá field khác. */
export async function saveSiteContent(pageId: SitePageId, blocks: SiteBlock[], updatedBy: string) {
  await setDoc(
    doc(db, 'siteContent', pageId),
    { blocks, updatedAt: serverTimestamp(), updatedBy },
    { merge: true }
  )
}

/** Tải ảnh từ máy lên Storage cho CMS. Ảnh được nén trước để trang public nhẹ. */
export async function uploadSiteImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Tệp không phải hình ảnh')
  const blob = await compressImage(file)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `site-content/${Date.now()}-${safeName.replace(/\.[^.]+$/, '')}.jpg`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
  return getDownloadURL(storageRef)
}

/* ─────────────────────────── BÀI VIẾT ─────────────────────────── */

export interface SitePost {
  id: string
  title: string
  slug: string
  excerpt: string
  body: string
  coverImage?: string
  category?: string
  author?: string
  /** Chỉ bài đã xuất bản mới hiện trên trang public. */
  published: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    // Bỏ dấu tiếng Việt (dải ký tự tổ hợp U+0300..U+036F)
    .replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Đọc toàn bộ bài viết cho trang quản trị (gồm cả bản nháp). */
export function useAllPosts() {
  const [posts, setPosts] = useState<SitePost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'posts'),
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
        console.warn('[posts admin]', err?.message)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return { posts, loading }
}

/** Tạo mới hoặc cập nhật bài viết. Trả về id. */
export async function savePost(post: Partial<SitePost> & { id?: string }, updatedBy: string) {
  const slug = post.slug?.trim() || slugify(post.title || '') || `bai-viet-${Date.now()}`
  const payload = {
    title: post.title || '',
    slug,
    excerpt: post.excerpt || '',
    body: post.body || '',
    coverImage: post.coverImage || '',
    category: post.category || '',
    author: post.author || '',
    published: post.published ?? false,
    updatedAt: serverTimestamp(),
    updatedBy,
  }
  if (post.id) {
    await setDoc(doc(db, 'posts', post.id), payload, { merge: true })
    return post.id
  }
  const ref = await addDoc(collection(db, 'posts'), { ...payload, createdAt: serverTimestamp() })
  return ref.id
}

export async function deletePost(id: string) {
  await deleteDoc(doc(db, 'posts', id))
}
