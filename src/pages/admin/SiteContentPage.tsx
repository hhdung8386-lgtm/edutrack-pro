/**
 * TRÌNH QUẢN LÝ NỘI DUNG TRANG PUBLIC
 *
 * Cho phép admin sửa nội dung các trang khách nhìn thấy (Trang chủ, Chương trình học,
 * Liên hệ) theo mô hình khối: thêm / sắp xếp / bật-tắt / sửa chữ / tải ảnh từ máy,
 * kèm khung xem trước ngay bên cạnh.
 *
 * AN TOÀN DỮ LIỆU:
 * - Chỉ ghi vào collection `siteContent`, không đụng dữ liệu nghiệp vụ.
 * - Trang public luôn có nội dung mặc định dự phòng, nên kể cả khi chưa lưu gì
 *   hoặc thiếu quyền thì trang vẫn hiển thị bình thường.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SiteBlockView } from '@/components/site/SiteBlocks'
import {
  BLOCK_TYPE_META,
  DEFAULT_CONTENT,
  SITE_PAGES,
  createEmptyBlock,
  createBlockId,
  saveSiteContent,
  uploadSiteImage,
  useSiteContent,
  useAllPosts,
  savePost,
  deletePost,
  type SitePost,
  type SiteBlock,
  type SiteBlockType,
  type SitePageId,
} from '@/lib/siteContent'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Newspaper,
  Trash2,
  X,
} from 'lucide-react'

/* ─────────────────── Ô nhập dùng chung ─────────────────── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      )}
    </label>
  )
}

/** Ô chọn ảnh: tải từ máy lên Storage rồi lưu URL. */
function ImageField({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (file?: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ảnh tối đa 10MB')
      return
    }
    setUploading(true)
    try {
      const url = await uploadSiteImage(file)
      onChange(url)
      toast.success('Đã tải ảnh lên')
    } catch (err) {
      console.error(err)
      toast.error('Không tải được ảnh. Kiểm tra quyền Storage hoặc thử lại.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">Hình ảnh</span>
      {value ? (
        <div className="group relative overflow-hidden rounded-xl border border-slate-200">
          <img src={value} alt="" className="h-36 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white"
            >
              Đổi ảnh
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-lg bg-rose-500/95 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-600"
            >
              Gỡ ảnh
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs font-bold">{uploading ? 'Đang tải ảnh…' : 'Chọn ảnh từ máy'}</span>
          <span className="text-[11px] font-medium text-slate-400">JPG, PNG — tối đa 10MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  )
}

/* ─────────────────── Trình sửa một khối ─────────────────── */

function BlockEditor({
  block,
  onChange,
}: {
  block: SiteBlock
  onChange: (patch: Partial<SiteBlock>) => void
}) {
  const items = block.items || []

  const patchItem = (id: string, patch: Partial<{ title: string; description: string; image: string }>) =>
    onChange({ items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })

  const hasItems = block.type === 'featureList' || block.type === 'stats'
  const hasCta = block.type === 'hero' || block.type === 'cta' || block.type === 'imageText'
  const hasBody = block.type === 'imageText' || block.type === 'richText'
  const hasImage = block.type === 'hero' || block.type === 'imageText' || block.type === 'featureList'

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4">
      {(block.type === 'hero' || block.type === 'featureList' || block.type === 'imageText') && (
        <Field label="Nhãn nhỏ phía trên" value={block.eyebrow || ''} onChange={(v) => onChange({ eyebrow: v })} placeholder="VD: Đội ngũ gia sư" />
      )}
      <Field label="Tiêu đề" value={block.title || ''} onChange={(v) => onChange({ title: v })} placeholder="Nhập tiêu đề" />
      {block.type !== 'richText' && (
        <Field label="Mô tả ngắn" value={block.subtitle || ''} onChange={(v) => onChange({ subtitle: v })} placeholder="Mô tả ngắn" multiline rows={2} />
      )}
      {hasBody && (
        <Field label="Nội dung" value={block.body || ''} onChange={(v) => onChange({ body: v })} placeholder="Nội dung chi tiết" multiline rows={5} />
      )}
      {hasImage && <ImageField value={block.image} onChange={(v) => onChange({ image: v })} />}

      {(block.type === 'imageText' || block.type === 'featureList') && (
        <div>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Vị trí ảnh</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(['left', 'right'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => onChange({ imagePosition: pos })}
                className={`min-h-9 rounded-lg text-xs font-bold transition ${
                  (block.imagePosition || 'right') === pos ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-white/60'
                }`}
              >
                {pos === 'left' ? 'Ảnh bên trái' : 'Ảnh bên phải'}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasCta && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Chữ trên nút" value={block.ctaLabel || ''} onChange={(v) => onChange({ ctaLabel: v })} placeholder="VD: Nhận tư vấn" />
          <Field label="Liên kết của nút" value={block.ctaHref || ''} onChange={(v) => onChange({ ctaHref: v })} placeholder="VD: /lien-he" />
        </div>
      )}

      {hasItems && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              {block.type === 'stats' ? 'Các con số' : 'Các mục'} ({items.length})
            </span>
            <button
              type="button"
              onClick={() => onChange({ items: [...items, { id: createBlockId(), title: '', description: '' }] })}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" />Thêm mục
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Mục {idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...items]
                        ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                        onChange({ items: next })
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Lên"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      onClick={() => {
                        const next = [...items]
                        ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                        onChange({ items: next })
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Xuống"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ items: items.filter((it) => it.id !== item.id) })}
                      className="rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Xoá mục"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Field
                    label={block.type === 'stats' ? 'Con số' : 'Tiêu đề mục'}
                    value={item.title}
                    onChange={(v) => patchItem(item.id, { title: v })}
                    placeholder={block.type === 'stats' ? 'VD: 10.000+' : 'Tiêu đề'}
                  />
                  <Field
                    label="Mô tả"
                    value={item.description}
                    onChange={(v) => patchItem(item.id, { description: v })}
                    placeholder="Mô tả ngắn"
                    multiline
                    rows={2}
                  />
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs font-semibold text-slate-400">
                Chưa có mục nào — bấm "Thêm mục"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────── Trang chính ─────────────────── */

/* ─────────────────── Quản lý Bài viết ─────────────────── */

function PostsManager({ uid }: { uid: string }) {
  const { posts, loading } = useAllPosts()
  const [editing, setEditing] = useState<(Partial<SitePost> & { id?: string }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SitePost | null>(null)

  const submit = async () => {
    if (!editing?.title?.trim()) {
      toast.warning('Vui lòng nhập tiêu đề bài viết')
      return
    }
    setSaving(true)
    try {
      await savePost(editing, uid)
      toast.success('Đã lưu bài viết')
      setEditing(null)
    } catch (err: unknown) {
      console.error(err)
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : ''
      toast.error(
        errorCode === 'permission-denied'
          ? 'Chưa có quyền ghi bài viết. Cần cập nhật Firestore Rules cho collection posts.'
          : 'Không lưu được bài viết'
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (post: SitePost) => {
    try {
      await deletePost(post.id)
      toast.success('Đã xoá bài viết')
    } catch {
      toast.error('Không xoá được bài viết')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">Bài viết ({posts.length})</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            Hiển thị công khai tại <span className="font-mono">/bai-viet</span>
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/bai-viet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            <Eye className="h-4 w-4" />Mở trang thật
          </a>
          <Button onClick={() => setEditing({ published: false })}>
            <Plus className="mr-1.5 h-4 w-4" />Viết bài mới
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
          <Newspaper className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-500">Chưa có bài viết nào</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {post.coverImage ? (
                <img src={post.coverImage} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 items-center justify-center bg-slate-50">
                  <Newspaper className="h-7 w-7 text-slate-300" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                      post.published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {post.published ? 'Đang hiển thị' : 'Bản nháp'}
                  </span>
                  {post.category && <span className="text-[10px] font-bold text-slate-400">{post.category}</span>}
                </div>
                <h3 className="line-clamp-2 text-sm font-black text-slate-800">{post.title}</h3>
                {post.excerpt && <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{post.excerpt}</p>}
                <div className="mt-auto flex gap-1.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditing(post)}
                    className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(post)}
                    className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-rose-500 hover:bg-rose-50"
                    aria-label="Xoá bài viết"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Bảng soạn bài */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={() => !saving && setEditing(null)}>
          <aside
            className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-black text-slate-900">{editing.id ? 'Sửa bài viết' : 'Viết bài mới'}</h2>
              <button type="button" onClick={() => !saving && setEditing(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <Field label="Tiêu đề *" value={editing.title || ''} onChange={(v) => setEditing({ ...editing, title: v })} placeholder="Tiêu đề bài viết" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Chuyên mục" value={editing.category || ''} onChange={(v) => setEditing({ ...editing, category: v })} placeholder="VD: Phương pháp học" />
                <Field label="Tác giả" value={editing.author || ''} onChange={(v) => setEditing({ ...editing, author: v })} placeholder="VD: 123English" />
              </div>
              <Field label="Mô tả ngắn" value={editing.excerpt || ''} onChange={(v) => setEditing({ ...editing, excerpt: v })} placeholder="Tóm tắt hiển thị ở danh sách" multiline rows={3} />
              <ImageField value={editing.coverImage} onChange={(v) => setEditing({ ...editing, coverImage: v })} />
              <Field label="Nội dung bài viết" value={editing.body || ''} onChange={(v) => setEditing({ ...editing, body: v })} placeholder="Nội dung đầy đủ. Xuống dòng để tách đoạn." multiline rows={14} />

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <input
                  type="checkbox"
                  checked={editing.published ?? false}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Xuất bản bài viết</span>
                  <span className="block text-xs font-medium text-slate-500">Bỏ tick để lưu thành bản nháp, khách chưa nhìn thấy</span>
                </span>
              </label>
            </div>

            <div className="flex gap-3 border-t border-slate-200 p-4">
              <Button variant="outline" fullWidth onClick={() => setEditing(null)} disabled={saving}>Huỷ</Button>
              <Button fullWidth onClick={submit} loading={saving}>
                <Save className="mr-1.5 h-4 w-4" />Lưu bài viết
              </Button>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        title="Xoá bài viết?"
        description={confirmDelete ? `Bài "${confirmDelete.title}" sẽ bị xoá vĩnh viễn.` : ''}
        consequence="Không thể hoàn tác. Nếu chỉ muốn ẩn tạm thời, hãy sửa bài và bỏ tick Xuất bản."
        confirmLabel="Xoá"
        confirmVariant="danger"
      />
    </div>
  )
}

export function SiteContentPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'pages' | 'posts'>('pages')
  const [pageId, setPageId] = useState<SitePageId>('home')
  const { content, loading, usingDefault } = useSiteContent(pageId)

  const [draft, setDraft] = useState<SiteBlock[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openBlockId, setOpenBlockId] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  // Nạp bản nháp từ dữ liệu thật; không ghi đè khi admin đang sửa dở.
  useEffect(() => {
    if (loading) return
    // Đồng bộ bản nháp khi dữ liệu realtime của trang vừa tải xong.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((current) => (dirty && current.length > 0 ? current : content.blocks))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, loading])

  // Đổi trang -> bỏ trạng thái sửa dở của trang cũ
  useEffect(() => {
    // Việc chuyển trang là ranh giới chủ ý để xoá trạng thái chỉnh sửa cục bộ.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirty(false)
    setOpenBlockId(null)
  }, [pageId])

  const pageMeta = useMemo(() => SITE_PAGES.find((p) => p.id === pageId)!, [pageId])

  const patchBlock = (id: string, patch: Partial<SiteBlock>) => {
    setDraft((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    setDirty(true)
  }

  const moveBlock = (index: number, dir: -1 | 1) => {
    setDraft((cur) => {
      const next = [...cur]
      const target = index + dir
      if (target < 0 || target >= next.length) return cur
      ;[next[target], next[index]] = [next[index], next[target]]
      return next
    })
    setDirty(true)
  }

  const addBlock = (type: SiteBlockType) => {
    const block = createEmptyBlock(type)
    setDraft((cur) => [...cur, block])
    setOpenBlockId(block.id)
    setShowAddMenu(false)
    setDirty(true)
  }

  const removeBlock = (id: string) => {
    setDraft((cur) => cur.filter((b) => b.id !== id))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveSiteContent(pageId, draft, user?.uid || 'admin')
      setDirty(false)
      toast.success('Đã lưu — trang public cập nhật ngay lập tức')
    } catch (err: unknown) {
      console.error(err)
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : ''
      toast.error(
        errorCode === 'permission-denied'
          ? 'Chưa có quyền ghi nội dung. Cần cập nhật Firestore Rules cho collection siteContent.'
          : 'Không lưu được, vui lòng thử lại'
      )
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = () => {
    setDraft(DEFAULT_CONTENT[pageId].blocks)
    setDirty(true)
    setConfirmReset(false)
    toast.info('Đã khôi phục bản mặc định — nhớ bấm Lưu để áp dụng')
  }

  return (
    <div className="space-y-5 pt-2 lg:pt-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" />
            Nội dung trang web
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Sửa chữ và ảnh của các trang khách nhìn thấy — lưu xong hiển thị ngay
          </p>
        </div>
        {tab === 'pages' && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={pageMeta.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
            >
              <Eye className="h-4 w-4" />Mở trang thật
            </a>
            <Button variant="outline" onClick={() => setConfirmReset(true)} disabled={saving}>
              <RotateCcw className="mr-1.5 h-4 w-4" />Khôi phục mặc định
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              <Save className="mr-1.5 h-4 w-4" />
              {dirty ? 'Lưu thay đổi' : 'Đã lưu'}
            </Button>
          </div>
        )}
      </div>

      {/* Chuyển giữa "Các trang" và "Bài viết" */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 sm:w-fit">
        {([
          { id: 'pages' as const, label: 'Các trang', Icon: LayoutTemplate },
          { id: 'posts' as const, label: 'Bài viết', Icon: Newspaper },
        ]).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (tab === 'pages' && id !== 'pages' && dirty && !window.confirm('Bạn có thay đổi chưa lưu. Rời đi và bỏ thay đổi?')) return
              setTab(id)
            }}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
              tab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <PostsManager uid={user?.uid || 'admin'} />
      ) : (
      <>
      {/* Chọn trang */}
      <div className="flex flex-wrap gap-2">
        {SITE_PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Chuyển trang khác và bỏ thay đổi?')) return
              setPageId(p.id)
            }}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              pageId === p.id
                ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className={`text-sm font-black ${pageId === p.id ? 'text-indigo-700' : 'text-slate-800'}`}>{p.label}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{p.description}</p>
          </button>
        ))}
      </div>

      {dirty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800">
          Có thay đổi chưa lưu — bấm "Lưu thay đổi" để áp dụng lên trang thật.
        </div>
      )}
      {usingDefault && !loading && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800">
          Trang này đang dùng nội dung mặc định trong hệ thống. Sửa và bấm Lưu để bắt đầu quản lý nội dung riêng.
        </div>
      )}

      {/* Hai cột: trình sửa + xem trước */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Cột trái: danh sách khối */}
        <div className="space-y-3">
          {draft.map((block, index) => {
            const meta = BLOCK_TYPE_META[block.type]
            const open = openBlockId === block.id
            return (
              <div
                key={block.id}
                className={`overflow-hidden rounded-2xl border bg-white transition ${
                  open ? 'border-indigo-400 shadow-[0_10px_30px_rgba(79,70,229,0.1)]' : 'border-slate-200'
                } ${block.enabled ? '' : 'opacity-70'}`}
              >
                <div className="flex items-center gap-2 p-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveBlock(index, -1)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Di chuyển lên"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(index, 1)}
                      disabled={index === draft.length - 1}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Di chuyển xuống"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenBlockId(open ? null : block.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-black text-slate-800">{block.title || meta.label}</p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{meta.label}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => patchBlock(block.id, { enabled: !block.enabled })}
                    className={`rounded-lg p-2 transition ${
                      block.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={block.enabled ? 'Đang hiển thị — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}
                  >
                    {block.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    className="rounded-lg p-2 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Xoá khối"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {open && <BlockEditor block={block} onChange={(patch) => patchBlock(block.id, patch)} />}
              </div>
            )
          })}

          {draft.length === 0 && !loading && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
              <LayoutTemplate className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-500">Chưa có khối nội dung nào</p>
            </div>
          )}

          {/* Thêm khối */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 py-4 text-sm font-black text-indigo-600 transition hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />Thêm khối nội dung
            </button>
            {showAddMenu && (
              <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Chọn loại khối</span>
                  <button type="button" onClick={() => setShowAddMenu(false)} className="text-slate-400 hover:text-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {(Object.keys(BLOCK_TYPE_META) as SiteBlockType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addBlock(type)}
                    className="block w-full border-b border-slate-50 px-4 py-3 text-left transition last:border-b-0 hover:bg-indigo-50/60"
                  >
                    <p className="text-sm font-bold text-slate-800">{BLOCK_TYPE_META[type].label}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">{BLOCK_TYPE_META[type].hint}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cột phải: xem trước */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Xem trước</span>
              <div className="flex gap-1 rounded-lg bg-slate-200/70 p-0.5">
                {([
                  { id: 'desktop' as const, Icon: Monitor, label: 'Máy tính' },
                  { id: 'mobile' as const, Icon: Smartphone, label: 'Điện thoại' },
                ]).map(({ id, Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewMode(id)}
                    title={label}
                    className={`rounded-md px-2.5 py-1 transition ${
                      previewMode === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto bg-slate-100 p-3">
              <div
                className={`mx-auto overflow-hidden rounded-xl bg-white shadow-sm transition-all ${
                  previewMode === 'mobile' ? 'max-w-[390px]' : 'w-full'
                }`}
              >
                {draft.filter((b) => b.enabled).length === 0 ? (
                  <p className="py-16 text-center text-sm font-semibold text-slate-400">
                    Chưa có khối nào đang hiển thị
                  </p>
                ) : (
                  draft
                    .filter((b) => b.enabled)
                    .map((block) => <SiteBlockView key={block.id} block={block} />)
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 px-1 text-[11px] font-medium leading-5 text-slate-500">
            Khung xem trước hiển thị đúng các khối bạn đang chỉnh. Các phần cố định của trang (thanh điều hướng,
            biểu mẫu tra cứu, chân trang) không nằm trong CMS nên không xuất hiện ở đây.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetToDefault}
        title="Khôi phục nội dung mặc định?"
        description={`Toàn bộ khối của trang "${pageMeta.label}" sẽ quay về bản mặc định của hệ thống.`}
        consequence="Thay đổi chỉ áp dụng sau khi bạn bấm Lưu. Nội dung đã lưu trước đó sẽ bị thay thế."
        confirmLabel="Khôi phục"
        confirmVariant="danger"
      />
      </>
      )}
    </div>
  )
}
