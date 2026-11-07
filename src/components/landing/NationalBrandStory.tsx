import {
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  Cpu,
  GraduationCap,
  Network,
  ShieldCheck,
} from 'lucide-react'
import { useL } from '@/stores/languageStore'
import { optimizedImage } from '@/lib/optimizedImages'

const ECOSYSTEM_ITEMS = [
  {
    Icon: GraduationCap,
    eyebrow: '123 TEACHERS',
    title: 'Gia sư được tuyển chọn',
    copy: 'Gia sư được kiểm tra hồ sơ, năng lực tiếng Anh và được hướng dẫn quy trình thực hiện buổi học 1 kèm 1 trước khi nhận học viên.',
    titleEn: 'Carefully selected tutors',
    copyEn: 'Every tutor’s background and English ability are checked, and they are trained on how we run 1-on-1 lessons before taking on any learner.',
    tone: 'mint',
  },
  {
    Icon: Network,
    eyebrow: '123 LEARNING PATH',
    title: 'Lộ trình phù hợp',
    copy: 'Nội dung học được lựa chọn theo độ tuổi, trình độ và mục tiêu của từng học viên.',
    titleEn: 'A path that fits',
    copyEn: 'Lesson content is chosen to match each learner’s age, level and goals.',
    tone: 'yellow',
  },
  {
    Icon: BookOpenCheck,
    eyebrow: '123 ONE-ON-ONE',
    title: 'Học trực tuyến 1 kèm 1',
    copy: 'Một gia sư đồng hành trực tiếp với một học viên trong từng buổi học.',
    titleEn: 'Online 1-on-1 lessons',
    copyEn: 'One tutor works directly with one learner in every lesson.',
    tone: 'blue',
  },
  {
    Icon: BadgeCheck,
    eyebrow: '123 PROGRESS TRACKING',
    title: 'Theo dõi tiến độ',
    copy: 'Thông tin về nội dung đã học, nhận xét và các điểm cần cải thiện được cập nhật sau buổi học.',
    titleEn: 'Progress tracking',
    copyEn: 'What was covered, the tutor’s feedback and points to improve are updated after every lesson.',
    tone: 'blue',
  },
  {
    Icon: Cpu,
    eyebrow: '123 PERSONALIZED SUPPORT',
    title: 'Hỗ trợ cá nhân hóa',
    copy: 'Dữ liệu học tập được sử dụng để hỗ trợ điều chỉnh nội dung và tốc độ học.',
    titleEn: 'Personalised support',
    copyEn: 'Learning data helps us adjust the content and pace of lessons.',
    tone: 'rose',
  },
  {
    Icon: BriefcaseBusiness,
    eyebrow: '123 STUDENT SUPPORT',
    title: 'Hỗ trợ học viên',
    copy: 'Đội ngũ 123English hỗ trợ học viên và phụ huynh trong quá trình sử dụng dịch vụ.',
    titleEn: 'Learner support',
    copyEn: 'The 123English team supports learners and parents throughout the service.',
    tone: 'yellow',
  },
] as const

const BRAND_TIMELINE = [
  {
    year: '2021',
    title: 'Ấp ủ ý tưởng',
    copy: 'Bắt đầu tìm hiểu nhu cầu học tiếng Anh trực tuyến và hình thức học 1 kèm 1, hướng đến sự linh hoạt về thời gian và địa điểm.',
    titleEn: 'The idea takes shape',
    copyEn: 'We began studying the demand for online English learning and the 1-on-1 format, aiming for flexibility in time and place.',
  },
  {
    year: '2022',
    title: 'Nghiên cứu mô hình',
    copy: 'Tập trung nghiên cứu cách kết nối học viên với gia sư phù hợp, đồng thời thử nghiệm cách sắp xếp lịch và hỗ trợ quá trình học trực tuyến.',
    titleEn: 'Researching the model',
    copyEn: 'We focused on how to match learners with the right tutor, while testing ways to schedule and support online learning.',
  },
  {
    year: '2023',
    title: 'Hoàn thiện cách tổ chức buổi học',
    copy: 'Qua quá trình thử nghiệm, dự án từng bước hoàn thiện cách sắp xếp một buổi học 1 kèm 1 theo cấu trúc 1–2–3, kết hợp một nội dung chính, hai hoạt động tương tác và ba phần thực hành.',
    titleEn: 'Refining the lesson format',
    copyEn: 'Through testing, we refined a 1–2–3 structure for 1-on-1 lessons: one main topic, two interactive activities and three practice tasks.',
  },
  {
    year: '2024',
    title: 'Hoàn thiện dự án',
    copy: 'Tiếp tục thử nghiệm và hoàn thiện quy trình, công cụ hỗ trợ cùng trải nghiệm kết nối giữa học viên và gia sư, chuẩn bị cho giai đoạn phát triển tiếp theo.',
    titleEn: 'Completing the project',
    copyEn: 'We kept testing and improving our processes, tools and the learner–tutor experience, preparing for the next stage of growth.',
  },
  {
    year: '2025',
    title: 'Phát triển dưới đơn vị chủ quản',
    copy: '123English được phát triển dưới sự chủ quản của Gia Sư Toàn Năng, tập trung vào dịch vụ hỗ trợ học tiếng Anh trực tuyến 1 kèm 1.',
    titleEn: 'Growing under a managing entity',
    copyEn: '123English is developed under Gia Sư Toàn Năng, focusing on online 1-on-1 English tutoring.',
  },
  {
    year: '2026',
    title: 'Mở rộng kết nối',
    copy: 'Tiếp tục mở rộng mạng lưới học viên và gia sư, đồng thời hoàn thiện các công cụ hỗ trợ việc kết nối, sắp xếp và theo dõi lịch học trực tuyến.',
    titleEn: 'Expanding our network',
    copyEn: 'We continue to grow our network of learners and tutors and improve the tools for matching, scheduling and tracking online lessons.',
  },
] as const

const AUDIENCE_SEGMENTS = [
  {
    Icon: BookOpenCheck,
    title: 'Trẻ em',
    copy: 'Gia sư đồng hành 1 kèm 1, sử dụng các hoạt động nghe, nói, trò chơi và tài liệu phù hợp với độ tuổi để hỗ trợ trẻ làm quen và sử dụng tiếng Anh tự nhiên hơn.',
    titleEn: 'Children',
    copyEn: 'A 1-on-1 tutor uses listening and speaking activities, games and age-appropriate materials to help children get comfortable using English naturally.',
    imageAltEn: 'A child learning English interactively with a tutor',
    image: '/audience-children-english-2026.jpg',
    imageAlt: 'Trẻ em học tiếng Anh tương tác cùng gia sư',
  },
  {
    Icon: GraduationCap,
    title: 'Thanh thiếu niên',
    copy: 'Gia sư hỗ trợ củng cố kiến thức, giao tiếp, đọc hiểu, viết và các kỹ năng tiếng Anh theo mục tiêu của học viên.',
    titleEn: 'Teenagers',
    copyEn: 'Tutors help strengthen grammar and vocabulary, speaking, reading, writing and other English skills according to the learner’s goals.',
    imageAltEn: 'A teenager practising academic English with a tutor',
    image: '/audience-teen-english-2026.jpg',
    imageAlt: 'Thanh thiếu niên ôn luyện tiếng Anh học thuật cùng gia sư',
  },
  {
    Icon: BriefcaseBusiness,
    title: 'Người đi làm',
    copy: 'Nội dung các buổi học được lựa chọn theo nhu cầu sử dụng tiếng Anh trong công việc và giao tiếp thực tế.',
    titleEn: 'Working adults',
    copyEn: 'Lesson content is chosen around how the learner needs English at work and in real-life conversations.',
    imageAltEn: 'A professional using English in an international workplace',
    image: '/audience-professional-english-2026.jpg',
    imageAlt: 'Người đi làm sử dụng tiếng Anh trong môi trường quốc tế',
  },
  {
    Icon: Network,
    title: 'Nhu cầu doanh nghiệp',
    copy: 'Hỗ trợ xây dựng nội dung học và bố trí gia sư theo nhu cầu sử dụng tiếng Anh của từng nhóm nhân sự.',
    titleEn: 'Businesses',
    copyEn: 'We help design lesson content and assign tutors based on how each team needs to use English.',
    imageAltEn: 'A company team learning English with a tutor',
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
  metaEn: string
  storyEn: string
  photo?: string
  tone: 'sky' | 'peach' | 'mint'
}[] = [
  {
    name: 'Minh Anh',
    meta: 'Tự tin nói hơn',
    metaEn: 'More confident speaking',
    storyEn: 'She used to speak very quietly in English lessons. Now she answers her teacher and can tell a few sentences about her day. She still hesitates sometimes, but she’s much more willing to speak.',
    photo: '/student-stories/minh-anh.png',
    story:
      'Trước đây, con thường nói rất nhỏ khi học tiếng Anh. Giờ con đã dám trả lời cô và kể vài câu về một ngày của mình. Có lúc vẫn ngập ngừng, nhưng con chịu nói hơn trước.',
    tone: 'sky',
  },
  {
    name: 'Gia Bảo',
    meta: 'Học từ những điều quen thuộc',
    metaEn: 'Learning from everyday things',
    storyEn: 'His favourite lessons are the ones with word-guessing games. Afterwards he picks up things around the house and quizzes me in English. When he forgets a word, we look it up together.',
    photo: '/student-stories/gia-bao.png',
    story:
      'Con thích nhất những buổi học có trò chơi đoán từ. Học xong, con hay lấy đồ vật trong nhà ra hỏi mẹ bằng tiếng Anh. Có từ chưa nhớ, hai mẹ con lại cùng xem.',
    tone: 'peach',
  },
  {
    name: 'Khánh Linh',
    meta: 'Tự chuẩn bị cho buổi học',
    metaEn: 'Getting ready on her own',
    storyEn: 'At first she always waited for me to sit next to her. Little by little she started setting up her headphones and opening the lesson herself. What makes me happiest is seeing her take the initiative without being reminded.',
    photo: '/student-stories/khanh-linh.png',
    story:
      'Lúc mới học, con cứ chờ mẹ ngồi bên cạnh. Dần dần, con tự chuẩn bị tai nghe và mở bài học. Mẹ vui nhất là thấy con chủ động, không phải nhắc nhiều như trước.',
    tone: 'mint',
  },
  {
    name: 'Đức Minh',
    meta: 'Bắt đầu từ chủ đề yêu thích',
    metaEn: 'Starting from a favourite topic',
    storyEn: 'He loves cars, so he gets really excited talking about them. From single words he has started putting short sentences together. He still makes mistakes, but he’s less afraid of making them.',
    photo: '/student-stories/duc-minh.png',
    story:
      'Con mê ô tô nên rất hào hứng khi được nói về chủ đề này. Từ những từ đơn lẻ, con bắt đầu ghép thành câu ngắn. Con vẫn nói sai, nhưng đã bớt sợ sai.',
    tone: 'sky',
  },
  {
    name: 'Ngọc Hà',
    meta: 'Nhớ từ qua những bài hát',
    metaEn: 'Remembering words through songs',
    storyEn: 'She often sings the songs from class again, sometimes with the actions. That way she remembers more words. For her, English is becoming a fun part of the day.',
    photo: '/student-stories/ngoc-ha.png',
    story:
      'Con hay hát lại những bài đã học trên lớp, có khi vừa hát vừa làm động tác. Nhờ vậy, con nhớ thêm nhiều từ. Với con, tiếng Anh đang trở thành một phần vui vẻ trong ngày.',
    tone: 'peach',
  },
  {
    name: 'Hoàng Nam',
    meta: 'Kiên nhẫn với từng bài học',
    metaEn: 'Patient with every lesson',
    storyEn: 'He used to skip any word he didn’t know. Now he tries to read it, then asks his teacher if he still doesn’t understand. Not every lesson is easy, but he’s become more patient.',
    photo: '/student-stories/hoang-nam.png',
    story:
      'Trước kia, gặp từ lạ là con bỏ qua. Bây giờ con thử đọc, rồi hỏi cô nếu chưa hiểu. Chưa phải bài nào cũng dễ, nhưng con đã kiên nhẫn hơn khi học.',
    tone: 'mint',
  },
]

function StudentStoryCard({ name, meta, story, metaEn, storyEn, photo, tone }: (typeof STUDENT_STORIES)[number]) {
  const L = useL()
  return (
    <article className={`national-story-card is-${tone}`}>
      <div className="national-story-media">
        {photo ? (
          <img src={optimizedImage(photo)} alt={L(`Ảnh minh họa ${name} học tiếng Anh tại nhà`, `Illustration of ${name} learning English at home`)} loading="lazy" decoding="async" width={1536} height={1024} />
        ) : (
          <span className="national-story-initial" aria-hidden="true">{name.split(' ').pop()?.charAt(0)}</span>
        )}
      </div>
      <div className="national-story-body">
        <h3>{name}</h3>
        <span className="national-story-meta">{L(meta, metaEn)}</span>
        <p>{L(story, storyEn)}</p>
      </div>
    </article>
  )
}

export function NationalBrandStory() {
  const L = useL()
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
                <h2>{L('Dịch vụ gia sư 1 kèm 1 tại 123English', '1-on-1 tutoring at 123English')}</h2>
                <p>
                  {L(
                    '123English cung cấp dịch vụ dạy thêm tiếng Anh trực tuyến theo hình thức gia sư 1 kèm 1. Học viên được bố trí gia sư và lựa chọn nội dung học thêm phù hợp với kiến thức cần củng cố, khả năng tiếp thu và nhu cầu thực tế. Mỗi buổi học được thực hiện trực tuyến với 01 gia sư – 01 học viên.',
                    '123English provides online 1-on-1 English tutoring. Each learner is matched with a tutor, and lesson content is chosen to fit what they need to strengthen, how quickly they learn and their real-life needs. Every lesson takes place online with one tutor and one learner.',
                  )}
                </p>
              </div>

              <article className="national-ecosystem-feature">
                <img
                  src="/home-hero-vietnam-2026-v2.webp"
                  alt={L('Gia đình đồng hành cùng học viên trong buổi học trực tuyến 1 kèm 1', 'A family supporting a learner during an online 1-on-1 lesson')}
                  loading="lazy"
                />
                <div>
                  <span className="national-feature-mark">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <h3>{L('Học trực tuyến 1 kèm 1, rõ ràng và có người theo sát.', 'Online 1-on-1 learning – clear, with someone following every step.')}</h3>
                  <p>
                    {L('Nội dung học, nhận xét và bước tiếp theo được lưu lại để gia đình dễ dàng theo dõi hành trình.', 'Lesson content, feedback and next steps are recorded so families can easily follow the journey.')}
                  </p>
                </div>
              </article>
            </div>

            <div className="national-ecosystem-list">
              {ECOSYSTEM_ITEMS.map(({ Icon, title, copy, titleEn, copyEn, tone }) => (
                <article key={title} className={`national-ecosystem-item is-${tone}`}>
                  <span><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3>{L(title, titleEn)}</h3>
                    <p>{L(copy, copyEn)}</p>
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
            <h2>{L('Về 123English', 'About 123English')}</h2>
            <p>
              {L(
                '123English là thương hiệu cung cấp dịch vụ dạy thêm tiếng Anh trực tuyến 1 kèm 1, thuộc đơn vị chủ quản Gia Sư Toàn Năng. 123English kết nối học viên với gia sư phù hợp, xây dựng nội dung và lộ trình học dựa trên độ tuổi, trình độ và mục tiêu của từng học viên. Trong quá trình học, kết quả và tiến độ được theo dõi thường xuyên nhằm giúp phụ huynh dễ dàng nắm bắt tình hình học tập và đồng hành cùng học viên.',
                '123English is a brand providing online 1-on-1 English tutoring, managed by Gia Sư Toàn Năng. We match each learner with the right tutor and build lesson content and a learning path around their age, level and goals. Results and progress are tracked regularly so parents can easily see how their child is doing and support them along the way.',
              )}
            </p>
          </div>

          <div className="national-trust-signals" aria-label={L('Dịch vụ gia sư tiếng Anh cho từng nhóm người học', 'English tutoring for every type of learner')}>
            {AUDIENCE_SEGMENTS.map(({ Icon, title, copy, titleEn, copyEn, image, imageAlt, imageAltEn }) => (
              <article key={title} className="national-trust-signal">
                <div className="national-trust-signal-media">
                  <img src={image} alt={L(imageAlt, imageAltEn)} loading="lazy" decoding="async" width={640} height={360} />
                  <span><Icon className="h-5 w-5" /></span>
                </div>
                <div className="national-trust-signal-copy">
                  <h3>{L(title, titleEn)}</h3>
                  <p>{L(copy, copyEn)}</p>
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
              <h3>{L('Hành trình phát triển', 'Our journey')}</h3>
              <p>{L('Từ một dự án được ấp ủ, nghiên cứu và thử nghiệm đến dịch vụ hỗ trợ học tiếng Anh trực tuyến 1 kèm 1 dưới sự chủ quản của Gia Sư Toàn Năng.', 'From an idea that was nurtured, researched and tested to an online 1-on-1 English tutoring service managed by Gia Sư Toàn Năng.')}</p>
            </div>
            <div className="national-growth-track">
              {BRAND_TIMELINE.map((milestone) => (
                <article key={milestone.year} className="national-growth-item">
                  <strong>{milestone.year}</strong>
                  <span aria-hidden="true" />
                  <h4>{L(milestone.title, milestone.titleEn)}</h4>
                  <p>{L(milestone.copy, milestone.copyEn)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="national-section national-section-stories">
        <div className="national-container">
          <div className="national-heading national-heading-centered">
            <h2>{L('Mỗi bạn nhỏ, một câu chuyện', 'Every child has a story')}</h2>
            <p>{L('Những thay đổi nhỏ trên hành trình học tiếng Anh.', 'Small changes along the English learning journey.')}</p>
          </div>
          <div className="national-story-grid">
            {STUDENT_STORIES.map((item) => (
              <StudentStoryCard key={item.name} {...item} />
            ))}
          </div>
          <p className="national-story-disclosure">{L('Tên, hình ảnh và câu chuyện được minh họa để giới thiệu trải nghiệm học tập.', 'Names, photos and stories are illustrative, shared to show the learning experience.')}</p>
        </div>
      </section>

    </div>
  )
}
