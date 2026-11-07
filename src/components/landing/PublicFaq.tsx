import { useL } from '@/stores/languageStore'

const FAQ_ITEMS = [
  {
    question: 'Hình thức học tại 123English như thế nào?',
    answer: 'Các buổi học được tổ chức trực tuyến 1 kèm 1, với một gia sư đồng hành cùng một học viên trong suốt buổi học. Nội dung và cách tương tác có thể được điều chỉnh theo nhu cầu của từng người học.',
    questionEn: 'How do lessons at 123English work?',
    answerEn: 'All lessons are held online, 1-on-1: one tutor works with one learner for the whole lesson. Content and the way the tutor interacts can be adjusted to each learner’s needs.',
  },
  {
    question: 'Một buổi học kéo dài bao lâu?',
    answer: 'Học viên có thể lựa chọn thời lượng 25 phút, 50 phút, 75 phút hoặc tối đa 100 phút cho mỗi buổi, tùy theo nhu cầu, độ tuổi và thời gian phù hợp.',
    questionEn: 'How long is a lesson?',
    answerEn: 'Learners can choose 25, 50 or 75 minutes, or up to 100 minutes per lesson, depending on their needs, age and availability.',
  },
  {
    question: '123English có buổi học thử không?',
    answer: 'Có. Học viên mới có thể đăng ký buổi học thử 1 kèm 1 miễn phí trong 25 phút. Buổi học giúp xác định khả năng nghe, nói và mức độ phù hợp của nội dung; đồng thời phụ huynh có thể quan sát cách gia sư tương tác với con trước khi quyết định đăng ký.',
    questionEn: 'Does 123English offer a trial lesson?',
    answerEn: 'Yes. New learners can book a free 25-minute 1-on-1 trial lesson. It helps assess listening and speaking skills and whether the content is a good fit, and parents can watch how the tutor interacts with their child before deciding to enrol.',
  },
  {
    question: 'Tôi có thể xem và lựa chọn gia sư không?',
    answer: 'Có. Học viên có thể tham khảo hồ sơ gia sư với các thông tin như kinh nghiệm, chuyên môn, chứng chỉ, giới thiệu cá nhân và lịch có thể nhận lớp để lựa chọn người phù hợp.',
    questionEn: 'Can I view and choose my tutor?',
    answerEn: 'Yes. Learners can browse tutor profiles – experience, specialisms, certificates, a personal introduction and available teaching times – to choose the right person.',
  },
  {
    question: 'Tôi có thể chủ động lựa chọn lịch học không?',
    answer: 'Có. Học viên có thể lựa chọn khung thời gian phù hợp dựa trên lịch trống của gia sư. Việc học trực tuyến giúp linh hoạt hơn về thời gian và địa điểm.',
    questionEn: 'Can I choose my own lesson times?',
    answerEn: 'Yes. Learners can pick time slots that suit them based on the tutor’s open schedule. Learning online gives more flexibility in both time and place.',
  },
  {
    question: '123English phù hợp với những đối tượng nào?',
    answer: 'Dịch vụ dành cho nhiều nhóm người học như trẻ em, học sinh, sinh viên và người đi làm. Nội dung có thể tập trung vào tiếng Anh nền tảng, giao tiếp, tiếng Anh từ lớp 1 đến lớp 12 hoặc hỗ trợ ôn luyện IELTS, TOEIC, VSTEP.',
    questionEn: 'Who is 123English for?',
    answerEn: 'The service is for many kinds of learners: young children, school and university students, and working adults. Lessons can focus on foundation English, communication, the Vietnamese school curriculum (grades 1–12), or IELTS, TOEIC and VSTEP preparation.',
  },
  {
    question: 'Một buổi học 1 kèm 1 được tổ chức như thế nào?',
    answer: 'Tùy nội dung và học viên, gia sư có thể triển khai theo cấu trúc 1–2–3: một nội dung chính, hai hoạt động tương tác và ba phần thực hành. Nội dung và độ khó được điều chỉnh theo từng buổi học.',
    questionEn: 'What does a 1-on-1 lesson look like?',
    answerEn: 'Depending on the content and the learner, the tutor may follow a 1–2–3 structure: one main topic, two interactive activities and three practice tasks. Content and difficulty are adjusted lesson by lesson.',
  },
  {
    question: 'Phụ huynh có thể theo dõi quá trình học của con không?',
    answer: 'Có. Phụ huynh có thể tra cứu các thông tin liên quan đến lịch học, tình trạng tham gia và tiến độ học tập, thuận tiện hơn trong việc theo dõi và đồng hành cùng con.',
    questionEn: 'Can parents follow their child’s progress?',
    answerEn: 'Yes. Parents can look up the class schedule, attendance and learning progress, making it easier to follow and support their child.',
  },
] as const

export function PublicFaq() {
  const L = useL()
  return (
    <section aria-labelledby="public-faq-title" className="public-faq">
      <div className="national-container">
        <h2 id="public-faq-title">{L('Câu hỏi thường gặp', 'Frequently asked questions')}</h2>
        <div className="public-faq-list">
          {FAQ_ITEMS.map(({ question, answer, questionEn, answerEn }, index) => (
            <details key={question} className="public-faq-item">
              <summary>
                <span className="public-faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{L(question, questionEn)}</h3>
                <span className="public-faq-toggle" aria-hidden="true" />
              </summary>
              <p>{L(answer, answerEn)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
