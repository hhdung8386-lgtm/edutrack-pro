export type CurriculumAudience = 'children' | 'teens' | 'adults'

export type CurriculumItem = {
  id: string
  name: string
  audienceLabel: string
  rangeLabel: string
  startLevel: number
  endLevel: number
  description: string
  nameEn?: string
  audienceLabelEn?: string
  rangeLabelEn?: string
  descriptionEn?: string
  /** Slug của bộ study plan tĩnh nếu giáo trình có trang chi tiết từng level. */
  studyPlanSlug?: 'basic-english'
  studyPlanEndLevel?: number
}

export type CurriculumGroup = {
  id: CurriculumAudience
  label: string
  summary: string
  labelEn?: string
  summaryEn?: string
  items: CurriculumItem[]
}

export const CURRICULUM_GROUPS: CurriculumGroup[] = [
  {
    id: 'children',
    label: 'Mầm non và thiếu nhi',
    labelEn: 'Pre-school and young learners',
    summaryEn: 'Learning through sounds, stories and familiar activities to build natural responses.',
    summary: 'Học qua âm thanh, câu chuyện và hoạt động gần gũi để xây nền phản xạ tự nhiên.',
    items: [
      {
        id: 'giai-dieu-tuoi-tho',
        nameEn: 'Childhood Melodies course',
        audienceLabelEn: 'Pre-school',
        rangeLabelEn: 'Books 1–3',
        descriptionEn: 'For pre-schoolers getting to know English through songs, movement and interactive games. Repeated melodies help children remember vocabulary, pronounce words naturally and build positive listening and speaking habits.',
        name: 'Giáo trình Giai Điệu Tuổi Thơ',
        audienceLabel: 'Mầm non',
        rangeLabel: 'Cuốn 1-3',
        startLevel: 1,
        endLevel: 3,
        description:
          'Dành cho trẻ mầm non làm quen tiếng Anh qua bài hát, vận động và trò chơi tương tác. Giai điệu lặp lại giúp trẻ ghi nhớ từ vựng, phát âm tự nhiên và hình thành phản xạ nghe nói tích cực.',
      },
      {
        id: 'ngu-am-dieu-ky',
        nameEn: 'Magical Phonics course',
        audienceLabelEn: 'Pre-school',
        rangeLabelEn: 'Books 1–6',
        descriptionEn: 'Helps children recognise letter sounds, practise mouth shapes, blend sounds and read words step by step. Short, lively activities build solid pronunciation and the confidence to read English.',
        name: 'Giáo trình Ngữ Âm Diệu Kỳ',
        audienceLabel: 'Mầm non',
        rangeLabel: 'Cuốn 1-6',
        startLevel: 1,
        endLevel: 6,
        description:
          'Giúp trẻ nhận biết âm chữ cái, luyện khẩu hình, ghép âm và đọc từ theo lộ trình trực quan. Hoạt động ngắn, sinh động giúp trẻ xây nền phát âm vững chắc và tự tin đọc tiếng Anh.',
      },
      {
        id: 'be-lam-chu-tieng-anh',
        nameEn: 'Little English Masters course',
        audienceLabelEn: 'Pre-school – Primary',
        rangeLabelEn: 'Starter – Book 9',
        descriptionEn: 'A complete path from Starter to Book 9 that develops topic-based vocabulary, sentence patterns and listening and speaking reflexes. Learners gradually move on to reading and writing so they can use English actively.',
        name: 'Giáo trình Bé Làm Chủ Tiếng Anh',
        audienceLabel: 'Mầm non - Thiếu nhi',
        rangeLabel: 'Starter - Cuốn 9',
        startLevel: 1,
        endLevel: 9,
        description:
          'Lộ trình toàn diện từ Starter đến Cuốn 9, phát triển từ vựng, mẫu câu và phản xạ nghe nói theo chủ đề. Học viên từng bước mở rộng sang đọc hiểu và viết để sử dụng tiếng Anh chủ động.',
      },
      {
        id: 'buoc-cung-anh-sao',
        nameEn: 'Walking with the Stars course',
        audienceLabelEn: 'Pre-school – Primary',
        rangeLabelEn: 'Starter – Book 5',
        descriptionEn: 'A communication programme built around familiar situations, combining listening, speaking, reading and writing stage by stage. Learners build confidence before moving on to more advanced young-learner courses.',
        name: 'Giáo trình Bước Cùng Ánh Sao',
        audienceLabel: 'Mầm non - Thiếu nhi',
        rangeLabel: 'Starter - Cuốn 5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Chương trình giao tiếp lấy tình huống gần gũi làm trung tâm, kết hợp nghe, nói, đọc và viết theo từng chặng. Học viên xây nền tự tin trước khi chuyển lên các giáo trình thiếu nhi nâng cao.',
      },
      {
        id: 'cau-chuyen-tieng-anh',
        nameEn: 'English Stories course',
        audienceLabelEn: 'Primary',
        rangeLabelEn: 'Books 1–9',
        descriptionEn: 'Learning English through stories, characters and vivid situations. Learners expand their vocabulary and practise retelling, organising ideas and expressing themselves naturally in English.',
        name: 'Giáo trình Câu Chuyện Tiếng Anh',
        audienceLabel: 'Thiếu nhi',
        rangeLabel: 'Cuốn 1-9',
        startLevel: 1,
        endLevel: 9,
        description:
          'Học tiếng Anh qua truyện kể, nhân vật và tình huống giàu hình ảnh. Học viên mở rộng vốn từ, rèn khả năng kể lại, sắp xếp ý và diễn đạt tự nhiên bằng tiếng Anh.',
      },
    ],
  },
  {
    id: 'teens',
    label: 'Thiếu niên',
    labelEn: 'Teenagers',
    summaryEn: 'Strengthening foundations and developing academic, speaking, reading and writing skills.',
    summary: 'Củng cố nền tảng và phát triển năng lực học thuật, giao tiếp, đọc hiểu và viết.',
    items: [
      {
        id: 'tieng-anh-nen-tang-thieu-nien',
        nameEn: 'Foundation English course',
        audienceLabelEn: 'Teenagers',
        rangeLabelEn: 'Books 1–5',
        descriptionEn: 'For beginners or learners who have lost their foundation. Builds pronunciation, vocabulary, grammar and basic communication so learners can use English confidently in everyday life.',
        name: 'Giáo trình Tiếng Anh Nền tảng',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Cuốn 1-5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
      },
      {
        id: 'doc-quyen-123english',
        nameEn: '123English course',
        audienceLabelEn: 'Teenagers',
        rangeLabelEn: 'Books 4–7',
        descriptionEn: 'Materials and a learning path developed by 123English, combining speaking, vocabulary, grammar and English reflexes to help learners use English confidently at school and in life.',
        name: 'Giáo trình Tiếng Anh 123English',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Cuốn 4-7',
        startLevel: 4,
        endLevel: 7,
        description:
          'Bộ tài liệu và lộ trình học do 123English xây dựng, kết hợp giao tiếp, từ vựng, ngữ pháp và phản xạ tiếng Anh, giúp học viên sử dụng tiếng Anh tự tin trong học tập và cuộc sống.',
      },
      {
        id: 'giao-tiep-thao-luan',
        nameEn: 'Communication and Discussion course',
        audienceLabelEn: 'Teenagers',
        rangeLabelEn: 'Books 3–5',
        descriptionEn: 'For learners who already have an English foundation. Develops conversation and topic discussion, presenting opinions and debating, and builds confidence in using English.',
        name: 'Giáo trình Giao tiếp và Thảo luận',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Cuốn 3-5',
        startLevel: 3,
        endLevel: 5,
        description:
          'Dành cho học viên đã có nền tảng tiếng Anh. Phát triển kỹ năng giao tiếp, thảo luận theo chủ đề, trình bày ý kiến, phản biện và nâng cao sự tự tin khi sử dụng tiếng Anh.',
      },
      {
        id: 'ky-nang-viet',
        nameEn: 'Writing Skills course',
        audienceLabelEn: 'Teenagers',
        rangeLabelEn: 'Books 2–4',
        descriptionEn: 'For learners who want to improve their writing. Guides them through writing sentences, paragraphs and essays level by level while reinforcing vocabulary and grammar.',
        name: 'Giáo trình Kỹ năng Viết',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Cuốn 2-4',
        startLevel: 2,
        endLevel: 4,
        description:
          'Dành cho học viên muốn cải thiện kỹ năng viết. Hướng dẫn cách viết câu, đoạn văn và bài viết theo từng cấp độ, đồng thời củng cố từ vựng và ngữ pháp.',
      },
      {
        id: 'ky-nang-doc-hieu',
        nameEn: 'Reading Skills course',
        audienceLabelEn: 'Teenagers',
        rangeLabelEn: 'Books 3–4',
        descriptionEn: 'For learners who want to improve reading comprehension. Expands vocabulary, trains content analysis and develops the ability to understand different kinds of English texts.',
        name: 'Giáo trình Kỹ năng Đọc hiểu',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Cuốn 3-4',
        startLevel: 3,
        endLevel: 4,
        description:
          'Dành cho học viên muốn nâng cao kỹ năng đọc hiểu. Giúp mở rộng vốn từ, rèn luyện kỹ năng phân tích nội dung và phát triển khả năng đọc hiểu các dạng văn bản tiếng Anh.',
      },
    ],
  },
  {
    id: 'adults',
    label: 'Người lớn',
    labelEn: 'Adults',
    summaryEn: 'Using English in daily life, at work and in real-life conversations.',
    summary: 'Ứng dụng tiếng Anh vào đời sống, công việc và những tình huống giao tiếp thực tế.',
    items: [
      {
        id: 'tieng-anh-nen-tang-nguoi-lon',
        nameEn: 'Foundation English course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Books 1–5',
        descriptionEn: 'For beginners or learners who have lost their foundation. Builds pronunciation, vocabulary, grammar and basic communication so learners can use English confidently in everyday life.',
        name: 'Giáo trình Tiếng Anh Nền tảng',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Cuốn 1-5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
        studyPlanSlug: 'basic-english',
        studyPlanEndLevel: 4,
      },
      {
        id: 'tieng-anh-hang-ngay',
        nameEn: 'Everyday English course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Books 3–5',
        descriptionEn: 'For learners with a basic foundation. Develops communication in real situations such as introducing yourself, shopping, travelling, work and daily conversation.',
        name: 'Giáo trình Tiếng Anh Hằng ngày',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Cuốn 3-5',
        startLevel: 3,
        endLevel: 5,
        description:
          'Dành cho học viên đã có nền tảng cơ bản. Phát triển kỹ năng giao tiếp trong các tình huống thực tế như giới thiệu bản thân, mua sắm, du lịch, công việc và giao tiếp hằng ngày.',
      },
      {
        id: 'hoi-thoai-theo-chu-de',
        nameEn: 'Topic-based Conversation course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Books 2–6',
        descriptionEn: 'For learners who want to speak better. Practises conversations on many real-life topics, expands vocabulary and improves reflexes, fluency and the ability to express opinions.',
        name: 'Giáo trình Hội thoại theo Chủ đề',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Cuốn 2-6',
        startLevel: 2,
        endLevel: 6,
        description:
          'Dành cho học viên mong muốn nâng cao khả năng giao tiếp. Luyện hội thoại theo nhiều chủ đề thực tế, mở rộng vốn từ, cải thiện phản xạ, độ lưu loát và khả năng diễn đạt ý kiến.',
      },
      {
        id: 'tieng-anh-cong-viec',
        nameEn: 'English for Work course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Books 4–6',
        descriptionEn: 'For university students and working adults. Develops communication in a business setting: meetings, presentations, emails and working with colleagues and international partners.',
        name: 'Giáo trình Tiếng Anh Công việc',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Cuốn 4-6',
        startLevel: 4,
        endLevel: 6,
        description:
          'Dành cho sinh viên và người đi làm. Phát triển kỹ năng giao tiếp trong môi trường doanh nghiệp như họp, thuyết trình, viết email, trao đổi với đồng nghiệp và đối tác quốc tế.',
      },
      {
        id: 'giao-tiep-tu-do',
        nameEn: 'Free Conversation course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Intermediate and above',
        descriptionEn: 'For learners at intermediate level and above. Natural conversation practice with a tutor while improving pronunciation, grammar, vocabulary and confidence in real-life situations.',
        name: 'Giáo trình Giao tiếp Tự do',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Trung cấp trở lên',
        startLevel: 4,
        endLevel: 9,
        description:
          'Dành cho học viên từ trình độ trung cấp trở lên. Luyện hội thoại tự nhiên với gia sư, đồng thời cải thiện phát âm, ngữ pháp, vốn từ và sự tự tin khi giao tiếp trong các tình huống thực tế.',
      },
      {
        id: 'phat-am-chuan',
        nameEn: 'Accurate Pronunciation course',
        audienceLabelEn: 'Adults',
        rangeLabelEn: 'Books 1–3',
        descriptionEn: 'For learners who want to improve their English pronunciation from the ground up. Introduces the International Phonetic Alphabet and practises individual sounds, word stress, linking and intonation.',
        name: 'Giáo trình Phát âm Chuẩn',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Cuốn 1-3',
        startLevel: 1,
        endLevel: 3,
        description:
          'Dành cho học viên muốn cải thiện phát âm tiếng Anh từ nền tảng. Chương trình giúp học viên làm quen với bảng ký hiệu ngữ âm quốc tế, luyện phát âm từng âm, trọng âm, nối âm và ngữ điệu.',
      },
    ],
  },
]

/** Danh mục giáo trình với chữ đã đổi sang ngôn ngữ đang chọn (id, cấp độ giữ nguyên). */
export function localizeCurriculumGroups(lang: 'vi' | 'en'): CurriculumGroup[] {
  if (lang !== 'en') return CURRICULUM_GROUPS
  return CURRICULUM_GROUPS.map((group) => ({
    ...group,
    label: group.labelEn || group.label,
    summary: group.summaryEn || group.summary,
    items: group.items.map((item) => ({
      ...item,
      name: item.nameEn || item.name,
      audienceLabel: item.audienceLabelEn || item.audienceLabel,
      rangeLabel: item.rangeLabelEn || item.rangeLabel,
      description: item.descriptionEn || item.description,
    })),
  }))
}
