export type EvaluationFormType = 'adult_comm' | 'tutor' | 'kids_a' | 'kids_b' | 'academic'

export interface CourseLevelOption {
  value: number
  label: string
}

export interface CourseOption {
  label: string
  description?: string
  levelOptions?: readonly CourseLevelOption[]
}

const numericLevels = (from: number, to: number): CourseLevelOption[] => (
  Array.from({ length: to - from + 1 }, (_, index) => {
    const value = from + index
    return { value, label: `Level ${value}` }
  })
)

export const EVALUATION_FORM_LABELS: Record<EvaluationFormType, string> = {
  adult_comm: 'Tiếng Anh 1 Kỹ Năng Người Lớn',
  tutor: 'Gia sư',
  kids_a: 'Tiếng Anh 1 Kỹ Năng Thiếu Niên',
  kids_b: 'Tiếng Anh 1 Kỹ Năng Trẻ Em',
  academic: 'Tiếng Anh 4 Kỹ Năng Luyện Thi',
}

export const EVALUATION_ROUTE_TITLES: Record<EvaluationFormType, string> = {
  adult_comm: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH 1 KỸ NĂNG NGƯỜI LỚN',
  tutor: 'LỘ TRÌNH HỌC ĐỀ XUẤT GIA SƯ',
  kids_a: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH 1 KỸ NĂNG THIẾU NIÊN',
  kids_b: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH 1 KỸ NĂNG TRẺ EM',
  academic: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH 4 KỸ NĂNG LUYỆN THI',
}

export const COURSE_OPTIONS: Record<Exclude<EvaluationFormType, 'tutor'>, readonly CourseOption[]> = {
  adult_comm: [
    {
      label: 'Basic English (Level 1–5)',
      levelOptions: numericLevels(1, 5),
      description: 'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
    },
    {
      label: 'Daily English (Level 3–5)',
      levelOptions: numericLevels(3, 5),
      description: 'Dành cho học viên đã có nền tảng cơ bản. Phát triển kỹ năng giao tiếp trong các tình huống thực tế như giới thiệu bản thân, mua sắm, du lịch, công việc và giao tiếp hằng ngày.',
    },
    {
      label: 'Topic Conversation (Level 1–6)',
      levelOptions: numericLevels(1, 6),
      description: 'Dành cho học viên mong muốn nâng cao khả năng giao tiếp. Luyện hội thoại theo nhiều chủ đề thực tế, mở rộng vốn từ, cải thiện phản xạ, độ lưu loát và khả năng diễn đạt ý kiến.',
    },
    {
      label: 'Business English (Level 4–6)',
      levelOptions: numericLevels(4, 6),
      description: 'Dành cho sinh viên và người đi làm. Phát triển kỹ năng giao tiếp trong môi trường doanh nghiệp như họp, thuyết trình, viết email, trao đổi với đồng nghiệp và đối tác quốc tế.',
    },
    {
      label: 'Free Talk',
      description: 'Dành cho học viên từ trình độ trung cấp trở lên. Luyện hội thoại tự nhiên với giáo viên, đồng thời cải thiện phát âm, ngữ pháp, vốn từ và sự tự tin khi giao tiếp trong các tình huống thực tế.',
    },
    {
      label: 'IPA Pronunciation (Level 1–3)',
      levelOptions: numericLevels(1, 3),
      description: 'Dành cho học viên muốn cải thiện phát âm tiếng Anh từ nền tảng. Chương trình giúp học viên làm quen với Bảng ký hiệu ngữ âm quốc tế (IPA), luyện phát âm chuẩn từng âm, trọng âm, nối âm và ngữ điệu, từ đó nâng cao khả năng nghe, nói và giao tiếp tự tin hơn.',
    },
  ],
  kids_a: [
    {
      label: 'Basic English (Level 1–5)',
      levelOptions: numericLevels(1, 5),
      description: 'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
    },
    {
      label: '123English Official Curriculum (Level 4–7)',
      levelOptions: numericLevels(4, 7),
      description: 'Chương trình độc quyền của 123English, kết hợp giao tiếp, từ vựng, ngữ pháp và phản xạ tiếng Anh, giúp học viên sử dụng tiếng Anh tự tin trong học tập và cuộc sống.',
    },
    {
      label: 'Time to Talk (Level 3–5)',
      levelOptions: numericLevels(3, 5),
      description: 'Dành cho học viên đã có nền tảng tiếng Anh. Chương trình phát triển kỹ năng giao tiếp, thảo luận theo chủ đề, trình bày ý kiến, phản biện và nâng cao sự tự tin khi sử dụng tiếng Anh.',
    },
    {
      label: 'Writing Source (Level 2–4)',
      levelOptions: numericLevels(2, 4),
      description: 'Dành cho học viên muốn cải thiện kỹ năng viết. Chương trình hướng dẫn cách viết câu, đoạn văn và bài viết theo từng cấp độ, đồng thời củng cố từ vựng và ngữ pháp.',
    },
    {
      label: 'Reading (Level 3–4)',
      levelOptions: numericLevels(3, 4),
      description: 'Dành cho học viên muốn nâng cao kỹ năng đọc hiểu. Chương trình giúp mở rộng vốn từ, rèn luyện kỹ năng phân tích nội dung và phát triển khả năng đọc hiểu các dạng văn bản tiếng Anh.',
    },
  ],
  kids_b: [
    {
      label: 'We Sing We Learn (Kindergarten)',
      description: 'Dành cho trẻ mầm non. Học tiếng Anh qua bài hát, trò chơi và hoạt động tương tác, giúp phát triển từ vựng, phát âm và phản xạ giao tiếp một cách tự nhiên.',
    },
    {
      label: 'Magic Phonics (Level 1–6)',
      levelOptions: numericLevels(1, 6),
      description: 'Dành cho trẻ mới bắt đầu học tiếng Anh. Khóa học giúp học viên làm quen với bảng chữ cái, phát âm chuẩn theo phương pháp Phonics, ghép vần, đọc từ và xây dựng nền tảng Nghe - Nói trước khi bước vào chương trình giao tiếp.',
    },
    {
      label: 'Smart Kids (Starter – Level 9)',
      levelOptions: [{ value: 0, label: 'Starter' }, ...numericLevels(1, 9)],
      description: 'Dành cho học viên đã hoàn thành Magic Phonics hoặc có nền tảng tiếng Anh cơ bản. Chương trình phát triển từ vựng, mẫu câu giao tiếp, phản xạ nghe - nói theo chủ đề và từng bước nâng cao khả năng sử dụng tiếng Anh một cách tự tin.',
    },
    {
      label: 'Good English - Storytelling (Level 1–9)',
      levelOptions: numericLevels(1, 9),
      description: 'Dành cho học viên có nền tảng giao tiếp cơ bản. Khóa học phát triển kỹ năng kể chuyện bằng tiếng Anh, mở rộng vốn từ, rèn luyện tư duy ngôn ngữ, khả năng diễn đạt và phản xạ giao tiếp tự nhiên.',
    },
    {
      label: 'Starlight (Level 1–5)',
      levelOptions: numericLevels(1, 5),
      description: 'Dành cho học sinh Tiểu học. Chương trình lấy giao tiếp làm trọng tâm, kết hợp phát triển 4 kỹ năng Nghe - Nói - Đọc - Viết, giúp học viên tự tin sử dụng tiếng Anh trong học tập và giao tiếp hằng ngày.',
    },
  ],
  academic: [
    {
      label: 'Cambridge Starters',
      description: 'Dành cho học viên chuẩn bị thi chứng chỉ Cambridge Starters (Pre A1). Chương trình phát triển 4 kỹ năng, làm quen cấu trúc đề thi và xây dựng nền tảng tiếng Anh quốc tế.',
    },
    {
      label: 'Cambridge Movers',
      description: 'Dành cho học viên hướng đến chứng chỉ Cambridge Movers (A1). Khóa học nâng cao khả năng giao tiếp, từ vựng và kỹ năng làm bài theo chuẩn Cambridge.',
    },
    {
      label: 'Cambridge Flyers',
      description: 'Dành cho học viên chuẩn bị thi Cambridge Flyers (A2). Chương trình phát triển toàn diện 4 kỹ năng và giúp học viên tự tin bước lên trình độ tiếng Anh cao hơn.',
    },
    {
      label: 'Cambridge KET (A2 Key)',
      description: 'Dành cho học sinh THCS hoặc học viên có trình độ A2. Chương trình củng cố ngữ pháp, mở rộng từ vựng, phát triển 4 kỹ năng và luyện thi theo chuẩn Cambridge.',
    },
    {
      label: 'Cambridge PET (B1 Preliminary)',
      description: 'Dành cho học viên trình độ trung cấp. Khóa học phát triển khả năng sử dụng tiếng Anh trong học tập và giao tiếp thực tế, đồng thời chuẩn bị cho kỳ thi Cambridge B1 Preliminary.',
    },
    {
      label: 'IELTS',
      description: 'Dành cho học viên có mục tiêu du học, tốt nghiệp hoặc định cư. Chương trình phát triển toàn diện 4 kỹ năng, kết hợp chiến lược làm bài để đạt mục tiêu điểm số mong muốn.',
    },
    {
      label: 'TOEIC',
      description: 'Dành cho học sinh, sinh viên và người đi làm. Chương trình tập trung phát triển kỹ năng Nghe - Đọc và bổ sung Nói - Viết theo nhu cầu, giúp học viên sử dụng tiếng Anh hiệu quả trong học tập và công việc.',
    },
    {
      label: 'Business English (4 Skills)',
      description: 'Dành cho học viên có nhu cầu phát triển tiếng Anh chuyên nghiệp. Chương trình kết hợp giao tiếp với 4 kỹ năng Nghe - Nói - Đọc - Viết, phù hợp cho môi trường doanh nghiệp và làm việc quốc tế.',
    },
  ],
}

export const TUTOR_SKILL_OPTIONS = [
  'Giao tiếp – Kỹ năng Nói',
  'Nắm bắt – Kỹ năng Nghe',
  'Đọc hiểu – Kỹ năng Đọc',
  'Ngữ pháp – Kỹ năng Viết',
] as const

const LEGACY_COURSE_LABELS: Record<string, string> = {
  'Topic Conversation (Level 2–6)': 'Topic Conversation (Level 1–6)',
}

export function normalizeCourseLabel(label: string): string {
  return LEGACY_COURSE_LABELS[label] || label
}

export function normalizeSelectedCourseLevels(courseLevels?: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(courseLevels || {}).map(([label, level]) => [normalizeCourseLabel(label), level]),
  )
}

export function getCourseOptions(formType: EvaluationFormType): readonly CourseOption[] {
  return formType === 'tutor' ? [] : COURSE_OPTIONS[formType]
}

export function getCourseOption(label: string): CourseOption | undefined {
  const normalizedLabel = normalizeCourseLabel(label)
  for (const options of Object.values(COURSE_OPTIONS)) {
    const option = options.find((item) => item.label === normalizedLabel)
    if (option) return option
  }

  return undefined
}

export function getCourseDescription(label: string): string | undefined {
  return getCourseOption(label)?.description
}
