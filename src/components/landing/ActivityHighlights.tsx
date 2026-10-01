import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

const ACTIVITIES = [
  { image: '/hoc-thu/tutor.webp', title: 'Kết nối gia sư,\nđồng hành học tập.', description: 'Gia sư phù hợp với độ tuổi, trình độ và mục tiêu của từng học viên.', caption: 'Kết nối gia sư và học viên', tone: 'tutors' },
  { image: '/hoc-thu/online-class.webp', title: 'Một gia sư.\nMột học viên.', description: 'Tương tác trực tiếp, thực hành tiếng Anh trong từng buổi học trực tuyến.', caption: 'Hỗ trợ học viên trong buổi học trực tuyến 1 kèm 1', tone: 'learning' },
  { image: '/hoc-thu/award-main.webp', title: 'Từng dấu ấn,\nmột hành trình.', description: 'Hình ảnh 123English tại lễ công bố Thương hiệu mạnh Quốc gia 2026.', caption: 'Dấu ấn trong quá trình phát triển dịch vụ', tone: 'brand' },
] as const

export function ActivityHighlights() {
  const trackRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    function syncMotion() { setReducedMotion(media.matches) }
    syncMotion()
    media.addEventListener('change', syncMotion)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => { observer.disconnect(); media.removeEventListener('change', syncMotion) }
  }, [])

  useEffect(() => {
    if (!playing || hovered || focused || !visible || reducedMotion) return
    const timer = window.setInterval(() => {
      if (!document.hidden) goTo((activeIndex + 1) % ACTIVITIES.length)
    }, 6000)
    return () => window.clearInterval(timer)
  }, [activeIndex, playing, hovered, focused, visible, reducedMotion])

  function goTo(index: number) {
    const track = trackRef.current
    const slide = track?.querySelectorAll<HTMLElement>('.activity-slide')[index]
    if (!track || !slide) return
    const trackBounds = track.getBoundingClientRect()
    const slideBounds = slide.getBoundingClientRect()
    track.scrollTo({
      left: track.scrollLeft + slideBounds.left - trackBounds.left - (track.clientWidth - slideBounds.width) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  function syncActiveSlide() {
    const track = trackRef.current
    if (!track) return
    const center = track.getBoundingClientRect().left + track.clientWidth / 2
    let nearest = 0
    let distance = Infinity
    track.querySelectorAll<HTMLElement>('.activity-slide').forEach((slide, index) => {
      const bounds = slide.getBoundingClientRect()
      const nextDistance = Math.abs(bounds.left + bounds.width / 2 - center)
      if (nextDistance < distance) {
        distance = nextDistance
        nearest = index
      }
    })
    setActiveIndex(nearest)
  }

  return (
    <section ref={sectionRef} className="activity-highlights" aria-labelledby="activity-highlights-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <div className="activity-heading">
        <h2 id="activity-highlights-title">Hoạt động nổi bật</h2>
        <p>Một số hình ảnh về hoạt động kết nối gia sư, hỗ trợ học viên và quá trình phát triển dịch vụ tiếng Anh trực tuyến 1 kèm 1 của 123English.</p>
      </div>
      <div className="activity-track" ref={trackRef} onScroll={syncActiveSlide} role="region" aria-label="Hình ảnh hoạt động 123English" tabIndex={0}>
        {ACTIVITIES.map((activity, index) => (
          <figure className="activity-slide" key={activity.image} role="group" aria-label={`Ảnh ${index + 1} trên ${ACTIVITIES.length}`}>
            <div className={`activity-artwork is-${activity.tone}`}>
              <div className="activity-artwork-copy">
                <span className="activity-brand">123English</span>
                <h3>{activity.title}</h3>
                <p>{activity.description}</p>
              </div>
              <div className="activity-photo"><img src={activity.image} alt={activity.caption} loading="lazy" /></div>
              <img className="activity-mascot" src="/hoc-thu/mascot.webp" alt="Mascot chuột 123English" loading="lazy" width={640} height={746} />
            </div>
            <figcaption>{activity.caption}</figcaption>
          </figure>
        ))}
      </div>
      <div className="activity-controls">
        <button type="button" className="activity-arrow" aria-label="Xem ảnh trước" onClick={() => goTo((activeIndex + ACTIVITIES.length - 1) % ACTIVITIES.length)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="activity-dots" aria-label="Chọn ảnh hoạt động">
          {ACTIVITIES.map((activity, index) => (
            <button key={activity.image} type="button" aria-label={`Xem ảnh ${index + 1}: ${activity.caption}`} aria-current={activeIndex === index ? 'true' : undefined} onClick={() => goTo(index)}>
              <span />
            </button>
          ))}
        </div>
        <button type="button" className="activity-arrow" aria-label="Xem ảnh tiếp theo" onClick={() => goTo((activeIndex + 1) % ACTIVITIES.length)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {!reducedMotion && <button type="button" className="activity-arrow" aria-label={playing ? 'Tạm dừng slide tự chạy' : 'Tiếp tục slide tự chạy'} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>}
      </div>
    </section>
  )
}
