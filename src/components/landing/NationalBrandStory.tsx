import {
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  Cpu,
  GraduationCap,
  Network,
  ShieldCheck,
} from 'lucide-react'

const ECOSYSTEM_ITEMS = [
  {
    Icon: GraduationCap,
    eyebrow: '123 TEACHERS',
    title: 'Gia sư được tuyển chọn',
    copy: 'Gia sư được kiểm tra hồ sơ, năng lực tiếng Anh và được hướng dẫn quy trình thực hiện buổi học 1 kèm 1 trước khi nhận học viên.',
    tone: 'mint',
  },
  {
    Icon: Network,
    eyebrow: '123 LEARNING PATH',
    title: 'Lộ trình phù hợp',
    copy: 'Nội dung học được lựa chọn theo độ tuổi, trình độ và mục tiêu của từng học viên.',
    tone: 'yellow',
  },
  {
    Icon: BookOpenCheck,
    eyebrow: '123 ONE-ON-ONE',
    title: 'Học trực tuyến 1 kèm 1',
    copy: 'Một gia sư đồng hành trực tiếp với một học viên trong từng buổi học.',
    tone: 'blue',
  },
  {
    Icon: BadgeCheck,
    eyebrow: '123 PROGRESS TRACKING',
    title: 'Theo dõi tiến độ',
    copy: 'Thông tin về nội dung đã học, nhận xét và các điểm cần cải thiện được cập nhật sau buổi học.',
    tone: 'blue',
  },
  {
    Icon: Cpu,
    eyebrow: '123 PERSONALIZED SUPPORT',
    title: 'Hỗ trợ cá nhân hóa',
    copy: 'Dữ liệu học tập được sử dụng để hỗ trợ điều chỉnh nội dung và tốc độ học.',
    tone: 'rose',
  },
  {
    Icon: BriefcaseBusiness,
    eyebrow: '123 STUDENT SUPPORT',
    title: 'Hỗ trợ học viên',
    copy: 'Đội ngũ 123English hỗ trợ học viên và phụ huynh trong quá trình sử dụng dịch vụ.',
    tone: 'yellow',
  },
] as const

const BRAND_TIMELINE = [
  {
    year: '2021',
    title: 'Ấp ủ ý tưởng',
    copy: 'Bắt đầu tìm hiểu nhu cầu học tiếng Anh trực tuyến và hình thức học 1 kèm 1, hướng đến sự linh hoạt về thời gian và địa điểm.',
  },
  {
    year: '2022',
    title: 'Nghiên cứu mô hình',
    copy: 'Tập trung nghiên cứu cách kết nối học viên với gia sư phù hợp, đồng thời thử nghiệm cách sắp xếp lịch và hỗ trợ quá trình học trực tuyến.',
  },
  {
    year: '2023',
    title: 'Hoàn thiện cách tổ chức buổi học',
    copy: 'Qua quá trình thử nghiệm, dự án từng bước hoàn thiện cách sắp xếp một buổi học 1 kèm 1 theo cấu trúc 1–2–3, kết hợp một nội dung chính, hai hoạt động tương tác và ba phần thực hành.',
  },
  {
    year: '2024',
    title: 'Hoàn thiện dự án',
    copy: 'Tiếp tục thử nghiệm và hoàn thiện quy trình, công cụ hỗ trợ cùng trải nghiệm kết nối giữa học viên và gia sư, chuẩn bị cho giai đoạn phát triển tiếp theo.',
  },
  {
    year: '2025',
    title: 'Phát triển dưới đơn vị chủ quản',
    copy: '123English được phát triển dưới sự chủ quản của Gia Sư Toàn Năng, tập trung vào dịch vụ hỗ trợ học tiếng Anh trực tuyến 1 kèm 1.',
  },
  {
    year: '2026',
    title: 'Mở rộng kết nối',
    copy: 'Tiếp tục mở rộng mạng lưới học viên và gia sư, đồng thời hoàn thiện các công cụ hỗ trợ việc kết nối, sắp xếp và theo dõi lịch học trực tuyến.',
  },
] as const

const AUDIENCE_SEGMENTS = [
  {
    Icon: BookOpenCheck,
    title: 'Trẻ em',
    copy: 'Gia sư đồng hành 1 kèm 1, sử dụng các hoạt động nghe, nói, trò chơi và tài liệu phù hợp với độ tuổi để hỗ trợ trẻ làm quen và sử dụng tiếng Anh tự nhiên hơn.',
    image: '/audience-children-english-2026.jpg',
    imageAlt: 'Trẻ em học tiếng Anh tương tác cùng gia sư',
  },
  {
    Icon: GraduationCap,
    title: 'Thanh thiếu niên',
    copy: 'Gia sư hỗ trợ củng cố kiến thức, giao tiếp, đọc hiểu, viết và các kỹ năng tiếng Anh theo mục tiêu của học viên.',
    image: '/audience-teen-english-2026.jpg',
    imageAlt: 'Thanh thiếu niên ôn luyện tiếng Anh học thuật cùng gia sư',
  },
  {
    Icon: BriefcaseBusiness,
    title: 'Người đi làm',
    copy: 'Nội dung các buổi học được lựa chọn theo nhu cầu sử dụng tiếng Anh trong công việc và giao tiếp thực tế.',
    image: '/audience-professional-english-2026.jpg',
    imageAlt: 'Người đi làm sử dụng tiếng Anh trong môi trường quốc tế',
  },
  {
    Icon: Network,
    title: 'Nhu cầu doanh nghiệp',
    copy: 'Hỗ trợ xây dựng nội dung học và bố trí gia sư theo nhu cầu sử dụng tiếng Anh của từng nhóm nhân sự.',
    image: '/audience-business-english-2026.jpg',
    imageAlt: 'Nhóm nhân sự doanh nghiệp học tiếng Anh cùng gia sư',
  },
] as const

/*
 * Nội dung và ảnh minh họa; thay bằng lời kể đã xác minh khi có tư liệu thật.
 */
const STUDENT_STORIES: {
  name: string
  meta: string
  story: string
  photo?: string
  tone: 'sky' | 'peach' | 'mint'
}[] = [
  {
    name: 'Minh Anh',
    meta: 'Tự tin nói hơn',
    photo: '/student-stories/minh-anh.png',
    story:
      'Trước đây, con thường nói rất nhỏ khi học tiếng Anh. Giờ con đã dám trả lời cô và kể vài câu về một ngày của mình. Có lúc vẫn ngập ngừng, nhưng con chịu nói hơn trước.',
    tone: 'sky',
  },
  {
    name: 'Gia Bảo',
    meta: 'Học từ những điều quen thuộc',
    photo: '/student-stories/gia-bao.png',
    story:
      'Con thích nhất những buổi học có trò chơi đoán từ. Học xong, con hay lấy đồ vật trong nhà ra hỏi mẹ bằng tiếng Anh. Có từ chưa nhớ, hai mẹ con lại cùng xem.',
    tone: 'peach',
  },
  {
    name: 'Khánh Linh',
    meta: 'Tự chuẩn bị cho buổi học',
    photo: '/student-stories/khanh-linh.png',
    story:
      'Lúc mới học, con cứ chờ mẹ ngồi bên cạnh. Dần dần, con tự chuẩn bị tai nghe và mở bài học. Mẹ vui nhất là thấy con chủ động, không phải nhắc nhiều như trước.',
    tone: 'mint',
  },
  {
    name: 'Đức Minh',
    meta: 'Bắt đầu từ chủ đề yêu thích',
    photo: '/student-stories/duc-minh.png',
    story:
      'Con mê ô tô nên rất hào hứng khi được nói về chủ đề này. Từ những từ đơn lẻ, con bắt đầu ghép thành câu ngắn. Con vẫn nói sai, nhưng đã bớt sợ sai.',
    tone: 'sky',
  },
  {
    name: 'Ngọc Hà',
    meta: 'Nhớ từ qua những bài hát',
    photo: '/student-stories/ngoc-ha.png',
    story:
      'Con hay hát lại những bài đã học trên lớp, có khi vừa hát vừa làm động tác. Nhờ vậy, con nhớ thêm nhiều từ. Với con, tiếng Anh đang trở thành một phần vui vẻ trong ngày.',
    tone: 'peach',
  },
  {
    name: 'Hoàng Nam',
    meta: 'Kiên nhẫn với từng bài học',
    photo: '/student-stories/hoang-nam.png',
    story:
      'Trước kia, gặp từ lạ là con bỏ qua. Bây giờ con thử đọc, rồi hỏi cô nếu chưa hiểu. Chưa phải bài nào cũng dễ, nhưng con đã kiên nhẫn hơn khi học.',
    tone: 'mint',
  },
]

function StudentStoryCard({ name, meta, story, photo, tone }: (typeof STUDENT_STORIES)[number]) {
  return (
    <article className={`national-story-card is-${tone}`}>
      <div className="national-story-media">
        {photo ? (
          <img src={photo} alt={`Ảnh minh họa ${name} học tiếng Anh tại nhà`} loading="lazy" decoding="async" width={1536} height={1024} />
        ) : (
          <span className="national-story-initial" aria-hidden="true">{name.split(' ').pop()?.charAt(0)}</span>
        )}
      </div>
      <div className="national-story-body">
        <h3>{name}</h3>
        <span className="national-story-meta">{meta}</span>
        <p>{story}</p>
      </div>
    </article>
  )
}

export function NationalBrandStory() {
  return (
    <div className="national-home">
      <section className="national-section national-section-ecosystem">
        <div className="national-container">
          {/*
            Tiêu đề nằm trong cột trái của lưới để lưới thẻ bên phải bắt đầu
            NGANG HÀNG với tiêu đề, thay vì bị đẩy xuống dưới.
          */}
          <div className="national-ecosystem-grid">
            <div className="national-ecosystem-main">
              <div className="national-heading">
                <h2>Dịch vụ gia sư 1 kèm 1 tại 123English</h2>
                <p>
                  123English cung cấp dịch vụ dạy thêm tiếng Anh trực tuyến theo hình thức gia sư 1 kèm 1. Học viên được bố trí gia sư và lựa chọn nội dung học thêm phù hợp với kiến thức cần củng cố, khả năng tiếp thu và nhu cầu thực tế. Mỗi buổi học được thực hiện trực tuyến với 01 gia sư – 01 học viên.
                </p>
              </div>

              <article className="national-ecosystem-feature">
                <img
                  src="/home-hero-vietnam-2026-v2.png"
                  alt="Gia đình đồng hành cùng học viên trong buổi học trực tuyến 1 kèm 1"
                  loading="lazy"
                />
                <div>
                  <span className="national-feature-mark">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <h3>Học trực tuyến 1 kèm 1, rõ ràng và có người theo sát.</h3>
                  <p>
                    Nội dung học, nhận xét và bước tiếp theo được lưu lại để gia đình dễ dàng theo dõi hành trình.
                  </p>
                </div>
              </article>
            </div>

            <div className="national-ecosystem-list">
              {ECOSYSTEM_ITEMS.map(({ Icon, title, copy, tone }) => (
                <article key={title} className={`national-ecosystem-item is-${tone}`}>
                  <span><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="national-section national-section-trust">
        <div className="national-container">
          <div className="national-trust-heading">
            <h2>Về 123English</h2>
            <p>
              123English là thương hiệu cung cấp dịch vụ dạy thêm tiếng Anh trực tuyến 1 kèm 1, thuộc đơn vị chủ quản Gia Sư Toàn Năng.
              123English kết nối học viên với gia sư phù hợp, xây dựng nội dung và lộ trình học dựa trên độ tuổi, trình độ và mục tiêu của từng học viên.
              Trong quá trình học, kết quả và tiến độ được theo dõi thường xuyên nhằm giúp phụ huynh dễ dàng nắm bắt tình hình học tập và đồng hành cùng học viên.
            </p>
          </div>

          <div className="national-trust-signals" aria-label="Dịch vụ gia sư tiếng Anh cho từng nhóm người học">
            {AUDIENCE_SEGMENTS.map(({ Icon, title, copy, image, imageAlt }) => (
              <article key={title} className="national-trust-signal">
                <div className="national-trust-signal-media">
                  <img src={image} alt={imageAlt} loading="lazy" width={640} height={360} />
                  <span><Icon className="h-5 w-5" /></span>
                </div>
                <div className="national-trust-signal-copy">
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Hành trình phát triển tách thành khối riêng, nền xanh để phân biệt với khối "Về 123English" */}
      <section className="national-section national-section-journey">
        <div className="national-container">
          <div className="national-growth-story">
            <div className="national-growth-heading">
              <h3>Hành trình phát triển</h3>
              <p>Từ một dự án được ấp ủ, nghiên cứu và thử nghiệm đến dịch vụ hỗ trợ học tiếng Anh trực tuyến 1 kèm 1 dưới sự chủ quản của Gia Sư Toàn Năng.</p>
            </div>
            <div className="national-growth-track">
              {BRAND_TIMELINE.map((milestone) => (
                <article key={milestone.year} className="national-growth-item">
                  <strong>{milestone.year}</strong>
                  <span aria-hidden="true" />
                  <h4>{milestone.title}</h4>
                  <p>{milestone.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="national-section national-section-stories">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <h2>Mỗi bạn nhỏ, một câu chuyện</h2>
            <p>Những thay đổi nhỏ trên hành trình học tiếng Anh.</p>
          </div>
          <div className="national-story-grid">
            {STUDENT_STORIES.map((item) => (
              <StudentStoryCard key={item.name} {...item} />
            ))}
          </div>
          <p className="national-story-disclosure">Tên, hình ảnh và câu chuyện được minh họa để giới thiệu trải nghiệm học tập.</p>
        </div>
      </section>

    </div>
  )
}
