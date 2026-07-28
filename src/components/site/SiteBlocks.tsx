/**
 * Hiển thị các khối nội dung do admin cấu hình trong CMS.
 * Dùng chung cho trang public và khung xem trước trong trang quản trị,
 * nhờ vậy admin thấy đúng những gì khách sẽ thấy.
 *
 * NGUYÊN TẮC GIAO DIỆN:
 * - Toàn bộ khối dùng CHUNG nền trắng để trang liền mạch, không bị "cắt khúc"
 *   thành từng dải màu khác nhau. Muốn tách khối thì dùng thẻ bo tròn màu nhạt
 *   bên trong, không đổi màu nền cả dải ngang.
 * - Ảnh luôn bo tròn đều và có khối màu thương hiệu mềm phía sau.
 */
import { ArrowRight } from 'lucide-react'
import type { SiteBlock } from '@/lib/siteContent'

/** Khung ngoài dùng chung: luôn nền trắng, khoảng cách dọc đồng nhất. */
function BlockShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  )
}

/** Ảnh bo tròn kèm khối màu mềm phía sau — thay cho ảnh cắt vuông thô. */
function SoftImage({
  src,
  alt,
  ratio = '4 / 3',
  blob = 'amber',
}: {
  src: string
  alt: string
  ratio?: string
  blob?: 'amber' | 'sky'
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={`absolute -left-5 -top-5 h-28 w-28 rounded-[2rem] ${
          blob === 'amber' ? 'bg-[#FFF4C7]' : 'bg-[#E8F7FD]'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute -bottom-5 -right-4 h-20 w-20 rounded-full ${
          blob === 'amber' ? 'bg-[#E8F7FD]' : 'bg-[#FFF4C7]'
        }`}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ aspectRatio: ratio }}
        className="relative w-full rounded-[2rem] object-cover shadow-[0_26px_60px_-32px_rgba(15,35,60,0.4)]"
      />
    </div>
  )
}

function CtaLink({ label, href, solid }: { label: string; href?: string; solid?: boolean }) {
  if (!label) return null
  return (
    <a
      href={href || '#'}
      className={
        solid
          ? 'mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FFC107] px-7 text-sm font-black text-[#10213A] shadow-[0_14px_30px_-12px_rgba(217,141,0,0.7)] transition-transform hover:-translate-y-0.5 active:translate-y-px'
          : 'mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-[#0E7EBA] transition-colors hover:text-[#10213A]'
      }
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </a>
  )
}

/* ── Khối mở đầu ── */
function HeroBlock({ block }: { block: SiteBlock }) {
  return (
    <BlockShell>
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          {block.eyebrow && (
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">{block.eyebrow}</p>
          )}
          {block.title && (
            <h2 className="mt-3 text-3xl font-black leading-[1.12] tracking-[-0.035em] text-[#10213A] sm:text-4xl lg:text-[2.75rem]">
              {block.title}
            </h2>
          )}
          {block.subtitle && (
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-slate-600">{block.subtitle}</p>
          )}
          <CtaLink label={block.ctaLabel || ''} href={block.ctaHref} solid />
        </div>
        {block.image && <SoftImage src={block.image} alt={block.title || ''} ratio="4 / 3" />}
      </div>
    </BlockShell>
  )
}

/**
 * Danh sách điểm mạnh — bố cục theo ảnh mẫu: ảnh một bên, danh sách bên kia,
 * các mục ngăn nhau bằng đường kẻ mảnh (không dùng thẻ nổi để tránh rối mắt).
 */
function FeatureListBlock({ block }: { block: SiteBlock }) {
  const items = block.items || []
  const imageLeft = (block.imagePosition || 'left') === 'left'

  return (
    <BlockShell>
      <div className={`grid items-center gap-10 lg:gap-14 ${block.image ? 'lg:grid-cols-2' : ''}`}>
        {block.image && (
          <div className={imageLeft ? 'lg:order-1' : 'lg:order-2'}>
            <SoftImage src={block.image} alt={block.title || ''} ratio="1 / 1" blob={imageLeft ? 'amber' : 'sky'} />
          </div>
        )}

        <div className={block.image ? (imageLeft ? 'lg:order-2' : 'lg:order-1') : ''}>
          {block.eyebrow && (
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#118ED0]">{block.eyebrow}</p>
          )}
          {block.title && (
            <h2 className="mt-2.5 text-2xl font-black leading-[1.18] tracking-[-0.03em] text-[#10213A] sm:text-3xl lg:text-[2.1rem]">
              {block.title}
            </h2>
          )}
          {block.subtitle && (
            <p className="mt-4 text-base font-medium leading-7 text-slate-600">{block.subtitle}</p>
          )}

          <ul className="mt-7 divide-y divide-slate-200/90 border-t border-slate-200/90">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <h3 className="text-base font-black text-[#10213A]">{item.title}</h3>
                {item.description && (
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{item.description}</p>
                )}
              </li>
            ))}
          </ul>

          <CtaLink label={block.ctaLabel || ''} href={block.ctaHref} />
        </div>
      </div>
    </BlockShell>
  )
}

/**
 * Ảnh kèm nội dung — đặt trong một thẻ bo tròn nền xám rất nhạt (theo ảnh mẫu),
 * tách khối bằng thẻ chứ không đổi màu cả dải ngang.
 */
function ImageTextBlock({ block }: { block: SiteBlock }) {
  const imageLeft = block.imagePosition === 'left'
  return (
    <BlockShell>
      <div className="overflow-hidden rounded-[2.25rem] bg-[#F6F7F9] p-6 sm:p-9 lg:p-12">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className={imageLeft ? 'lg:order-2' : 'lg:order-1'}>
            {block.eyebrow && (
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A76500]">{block.eyebrow}</p>
            )}
            {block.title && (
              <h2 className="mt-2.5 text-2xl font-black leading-[1.18] tracking-[-0.03em] text-[#10213A] sm:text-3xl">
                {block.title}
              </h2>
            )}
            {block.body && (
              <p className="mt-4 whitespace-pre-line text-base font-medium leading-7 text-slate-600">{block.body}</p>
            )}
            <CtaLink label={block.ctaLabel || ''} href={block.ctaHref} solid />
          </div>

          <div className={imageLeft ? 'lg:order-1' : 'lg:order-2'}>
            {block.image ? (
              <img
                src={block.image}
                alt={block.title || ''}
                loading="lazy"
                style={{ aspectRatio: '4 / 3' }}
                className="w-full rounded-[1.75rem] object-cover shadow-[0_22px_50px_-28px_rgba(15,35,60,0.45)]"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-[1.75rem] border-2 border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-400">
                Chưa có ảnh
              </div>
            )}
          </div>
        </div>
      </div>
    </BlockShell>
  )
}

function StatsBlock({ block }: { block: SiteBlock }) {
  const items = block.items || []
  return (
    <BlockShell>
      {block.title && (
        <h2 className="text-2xl font-black tracking-[-0.03em] text-[#10213A] sm:text-3xl">{block.title}</h2>
      )}
      {block.subtitle && (
        <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-slate-600">{block.subtitle}</p>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-[1.5rem] border border-slate-200/80 bg-[#FFFBEB] p-6">
            <div className="text-3xl font-black tracking-[-0.04em] text-[#10213A]">{item.title}</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </div>
    </BlockShell>
  )
}

function CtaBlock({ block }: { block: SiteBlock }) {
  return (
    <BlockShell>
      <div className="overflow-hidden rounded-[2.25rem] bg-[#10213A] px-7 py-10 text-white sm:px-12 sm:py-14">
        <div className="grid items-center gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            {block.title && <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{block.title}</h2>}
            {block.subtitle && (
              <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-300">{block.subtitle}</p>
            )}
          </div>
          {block.ctaLabel && (
            <a
              href={block.ctaHref || '#'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FFC107] px-7 text-sm font-black text-[#10213A] transition-transform hover:-translate-y-0.5 lg:justify-self-end"
            >
              {block.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </BlockShell>
  )
}

function RichTextBlock({ block }: { block: SiteBlock }) {
  return (
    <BlockShell>
      <div className="max-w-3xl">
        {block.title && (
          <h2 className="text-2xl font-black tracking-[-0.03em] text-[#10213A] sm:text-3xl">{block.title}</h2>
        )}
        {block.body && (
          <p className="mt-4 whitespace-pre-line text-base font-medium leading-7 text-slate-600">{block.body}</p>
        )}
      </div>
    </BlockShell>
  )
}

export function SiteBlockView({ block }: { block: SiteBlock }) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />
    case 'featureList':
      return <FeatureListBlock block={block} />
    case 'imageText':
      return <ImageTextBlock block={block} />
    case 'stats':
      return <StatsBlock block={block} />
    case 'cta':
      return <CtaBlock block={block} />
    case 'richText':
    default:
      return <RichTextBlock block={block} />
  }
}

/** Render toàn bộ khối đang bật của một trang. */
export function SiteBlocks({ blocks }: { blocks: SiteBlock[] }) {
  const visible = blocks.filter((b) => b.enabled)
  if (visible.length === 0) return null
  return (
    <>
      {visible.map((block) => (
        <SiteBlockView key={block.id} block={block} />
      ))}
    </>
  )
}
