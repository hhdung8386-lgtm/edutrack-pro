import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const ACTIVITIES = [
  { image: '/hoc-thu/tutor.webp', title: 'Kết nối gia sư,\nđồng hành học tập.', description: 'Gia sư phù hợp với độ tuổi, trình độ và mục tiêu của từng học viên.', caption: 'Kết nối gia sư và học viên', tone: 'tutors' },
  { image: '/hoc-thu/online-class.webp', title: 'Một gia sư.\nMột học viên.', description: 'Tương tác trực tiếp, thực hành tiếng Anh trong từng buổi học trực tuyến.', caption: 'Hỗ trợ học viên trong buổi học trực tuyến 1 kèm 1', tone: 'learning' },
  { image: '/hoc-thu/award-main.webp', title: 'Từng dấu ấn,\nmột hành trình.', description: 'Hình ảnh 123English tại lễ công bố Thương hiệu mạnh Quốc gia 2026.', caption: 'Dấu ấn trong quá trình phát triển dịch vụ', tone: 'brand' },
] as const

export function ActivityHighlights() {
  const trackRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const positionRef = useRef(0)
  const lastWrittenRef = useRef(0)
  const draggingRef = useRef(false)
  const interactionUntilRef = useRef(0)
  const geometryRef = useRef({ start: 0, cycle: 0 })
  const targetRef = useRef<{ from: number; to: number; started: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    function syncMotion() { setReducedMotion(media.matches) }
    syncMotion()
    media.addEventListener('change', syncMotion)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    function releasePointer() {
      draggingRef.current = false
      interactionUntilRef.current = performance.now() + 500
    }
    window.addEventListener('pointerup', releasePointer)
    window.addEventListener('pointercancel', releasePointer)
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', syncMotion)
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('pointercancel', releasePointer)
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    function alignTrack() {
      if (!track) return
      const slides = track.querySelectorAll<HTMLElement>('.activity-slide')
      const first = slides[ACTIVITIES.length]
      const nextCopy = slides[ACTIVITIES.length * 2]
      if (!first || !nextCopy) return
      positionRef.current = first.offsetLeft - track.offsetLeft - (track.clientWidth - first.clientWidth) / 2
      geometryRef.current = { start: positionRef.current, cycle: nextCopy.offsetLeft - first.offsetLeft }
      track.scrollLeft = positionRef.current
      lastWrittenRef.current = track.scrollLeft
      targetRef.current = null
    }
    alignTrack()
    const observer = new ResizeObserver(alignTrack)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || reducedMotion) return
    const track = trackRef.current
    if (!track) return
    let frame = 0
    let previousTime = 0
    function move(time: number) {
      if (!track) return
      const elapsed = previousTime ? Math.min(time - previousTime, 64) : 0
      previousTime = time
      if (!document.hidden && !draggingRef.current && time >= interactionUntilRef.current) {
        const { start, cycle } = geometryRef.current
        if (cycle > 0) {
          const target = targetRef.current
          if (target) {
            const progress = Math.min((time - target.started) / 900, 1)
            const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
            positionRef.current = target.from + (target.to - target.from) * eased
            if (progress === 1) targetRef.current = null
          } else {
            positionRef.current += elapsed * 0.045
          }
          if (!targetRef.current) {
            if (positionRef.current >= start + cycle) positionRef.current -= cycle
            if (positionRef.current < start) positionRef.current += cycle
          }
          track.scrollLeft = positionRef.current
          lastWrittenRef.current = track.scrollLeft
        }
      }
      frame = requestAnimationFrame(move)
    }
    frame = requestAnimationFrame(move)
    return () => cancelAnimationFrame(frame)
  }, [visible, reducedMotion])

  function goTo(index: number, direction = 0) {
    const track = trackRef.current
    if (!track) return
    interactionUntilRef.current = 0
    const trackBounds = track.getBoundingClientRect()
    const slides = [...track.querySelectorAll<HTMLElement>('.activity-slide')]
    const candidates = slides.filter((_, position) => position % ACTIVITIES.length === index)
    const center = trackBounds.left + track.clientWidth / 2
    const slide = candidates.sort((a, b) => {
      function distance(item: HTMLElement) {
        const bounds = item.getBoundingClientRect()
        const delta = bounds.left + bounds.width / 2 - center
        return direction && delta * direction < -2 ? Infinity : Math.abs(delta)
      }
      return distance(a) - distance(b)
    })[0]
    if (!slide) return
    const slideBounds = slide.getBoundingClientRect()
    const destination = track.scrollLeft + slideBounds.left - trackBounds.left - (track.clientWidth - slideBounds.width) / 2
    if (reducedMotion) {
      track.scrollLeft = destination
      positionRef.current = destination
      lastWrittenRef.current = track.scrollLeft
    } else {
      targetRef.current = { from: track.scrollLeft, to: destination, started: performance.now() }
    }
  }

  function syncActiveSlide() {
    const track = trackRef.current
    if (!track) return
    if (Math.abs(track.scrollLeft - lastWrittenRef.current) > 2) {
      positionRef.current = track.scrollLeft
      targetRef.current = null
      interactionUntilRef.current = performance.now() + 500
    }
    const { start, cycle } = geometryRef.current
    if (cycle > 0) {
      const nearest = Math.round((track.scrollLeft - start) / (cycle / ACTIVITIES.length))
      setActiveIndex((nearest % ACTIVITIES.length + ACTIVITIES.length) % ACTIVITIES.length)
    }
  }

  return (
    <section ref={sectionRef} className="activity-highlights" aria-labelledby="activity-highlights-title">
      <div className="activity-heading">
        <h2 id="activity-highlights-title">Hoạt động nổi bật</h2>
        <p>Một số hình ảnh về hoạt động kết nối gia sư, hỗ trợ học viên và quá trình phát triển dịch vụ tiếng Anh trực tuyến 1 kèm 1 của 123English.</p>
      </div>
      <div className={`activity-track${reducedMotion ? ' is-reduced-motion' : ''}`} ref={trackRef} onScroll={syncActiveSlide} onPointerDown={() => { draggingRef.current = true; targetRef.current = null }} onPointerUp={() => { draggingRef.current = false }} onPointerCancel={() => { draggingRef.current = false }} onLostPointerCapture={() => { draggingRef.current = false }} role="region" aria-label="Hình ảnh hoạt động 123English" tabIndex={0}>
        {[...ACTIVITIES, ...ACTIVITIES, ...ACTIVITIES].map((activity, index) => (
          <figure className="activity-slide" key={`${activity.image}-${index}`} role="group" aria-hidden={index < ACTIVITIES.length || index >= ACTIVITIES.length * 2 ? true : undefined} aria-label={`Ảnh ${index % ACTIVITIES.length + 1} trên ${ACTIVITIES.length}`}>
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
        <button type="button" className="activity-arrow" aria-label="Xem ảnh trước" onClick={() => goTo((activeIndex + ACTIVITIES.length - 1) % ACTIVITIES.length, -1)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="activity-dots" aria-label="Chọn ảnh hoạt động">
          {ACTIVITIES.map((activity, index) => (
            <button key={activity.image} type="button" aria-label={`Xem ảnh ${index + 1}: ${activity.caption}`} aria-current={activeIndex === index ? 'true' : undefined} onClick={() => goTo(index)}>
              <span />
            </button>
          ))}
        </div>
        <button type="button" className="activity-arrow" aria-label="Xem ảnh tiếp theo" onClick={() => goTo((activeIndex + 1) % ACTIVITIES.length, 1)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
