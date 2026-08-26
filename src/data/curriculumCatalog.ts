export type CurriculumAudience = 'children' | 'teens' | 'adults'

export type CurriculumItem = {
  id: string
  name: string
  audienceLabel: string
  rangeLabel: string
  startLevel: number
  endLevel: number
  description: string
  /** Slug của bộ study plan tĩnh nếu giáo trình có trang chi tiết từng level. */
  studyPlanSlug?: 'basic-english'
  studyPlanEndLevel?: number
}

export type CurriculumGroup = {
  id: CurriculumAudience
  label: string
  summary: string
  items: CurriculumItem[]
}

export const CURRICULUM_GROUPS: CurriculumGroup[] = [
  {
    id: 'children',
    label: 'Mầm non và thiếu nhi',
    summary: 'Học qua âm thanh, câu chuyện và hoạt động gần gũi để xây nền phản xạ tự nhiên.',
    items: [
      {
        id: 'giai-dieu-tuoi-tho',
        name: 'Giáo trình Giai Điệu Tuổi Thơ',
        audienceLabel: 'Mầm non',
        rangeLabel: 'Level 1-3',
        startLevel: 1,
        endLevel: 3,
        description:
          'Dành cho trẻ mầm non làm quen tiếng Anh qua bài hát, vận động và trò chơi tương tác. Giai điệu lặp lại giúp trẻ ghi nhớ từ vựng, phát âm tự nhiên và hình thành phản xạ nghe nói tích cực.',
      },
      {
        id: 'ngu-am-dieu-ky',
        name: 'Giáo trình Ngữ Âm Diệu Kỳ',
        audienceLabel: 'Mầm non',
        rangeLabel: 'Level 1-6',
        startLevel: 1,
        endLevel: 6,
        description:
          'Giúp trẻ nhận biết âm chữ cái, luyện khẩu hình, ghép âm và đọc từ theo lộ trình trực quan. Hoạt động ngắn, sinh động giúp trẻ xây nền phát âm vững chắc và tự tin đọc tiếng Anh.',
      },
      {
        id: 'be-lam-chu-tieng-anh',
        name: 'Giáo trình Bé Làm Chủ Tiếng Anh',
        audienceLabel: 'Mầm non - Thiếu nhi',
        rangeLabel: 'Starter - Level 9',
        startLevel: 1,
        endLevel: 9,
        description:
          'Lộ trình toàn diện từ Starter đến Level 9, phát triển từ vựng, mẫu câu và phản xạ nghe nói theo chủ đề. Học viên từng bước mở rộng sang đọc hiểu và viết để sử dụng tiếng Anh chủ động.',
      },
      {
        id: 'buoc-cung-anh-sao',
        name: 'Giáo trình Bước Cùng Ánh Sao',
        audienceLabel: 'Mầm non - Thiếu nhi',
        rangeLabel: 'Starter - Level 5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Chương trình giao tiếp lấy tình huống gần gũi làm trung tâm, kết hợp nghe, nói, đọc và viết theo từng chặng. Học viên xây nền tự tin trước khi chuyển lên các giáo trình thiếu nhi nâng cao.',
      },
      {
        id: 'cau-chuyen-tieng-anh',
        name: 'Giáo trình Câu Chuyện Tiếng Anh',
        audienceLabel: 'Thiếu nhi',
        rangeLabel: 'Level 1-9',
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
    summary: 'Củng cố nền tảng và phát triển năng lực học thuật, giao tiếp, đọc hiểu và viết.',
    items: [
      {
        id: 'tieng-anh-nen-tang-thieu-nien',
        name: 'Giáo trình Tiếng Anh Nền tảng',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Level 1-5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
      },
      {
        id: 'doc-quyen-123english',
        name: 'Giáo trình Tiếng Anh Độc quyền 123English',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Level 4-7',
        startLevel: 4,
        endLevel: 7,
        description:
          'Chương trình độc quyền của 123English, kết hợp giao tiếp, từ vựng, ngữ pháp và phản xạ tiếng Anh, giúp học viên sử dụng tiếng Anh tự tin trong học tập và cuộc sống.',
      },
      {
        id: 'giao-tiep-thao-luan',
        name: 'Giáo trình Giao tiếp và Thảo luận',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Level 3-5',
        startLevel: 3,
        endLevel: 5,
        description:
          'Dành cho học viên đã có nền tảng tiếng Anh. Phát triển kỹ năng giao tiếp, thảo luận theo chủ đề, trình bày ý kiến, phản biện và nâng cao sự tự tin khi sử dụng tiếng Anh.',
      },
      {
        id: 'ky-nang-viet',
        name: 'Giáo trình Kỹ năng Viết',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Level 2-4',
        startLevel: 2,
        endLevel: 4,
        description:
          'Dành cho học viên muốn cải thiện kỹ năng viết. Hướng dẫn cách viết câu, đoạn văn và bài viết theo từng cấp độ, đồng thời củng cố từ vựng và ngữ pháp.',
      },
      {
        id: 'ky-nang-doc-hieu',
        name: 'Giáo trình Kỹ năng Đọc hiểu',
        audienceLabel: 'Thiếu niên',
        rangeLabel: 'Level 3-4',
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
    summary: 'Ứng dụng tiếng Anh vào đời sống, công việc và những tình huống giao tiếp thực tế.',
    items: [
      {
        id: 'tieng-anh-nen-tang-nguoi-lon',
        name: 'Giáo trình Tiếng Anh Nền tảng',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Level 1-5',
        startLevel: 1,
        endLevel: 5,
        description:
          'Dành cho người mới bắt đầu hoặc mất gốc. Xây dựng nền tảng phát âm, từ vựng, ngữ pháp và giao tiếp cơ bản, giúp học viên tự tin sử dụng tiếng Anh trong cuộc sống hằng ngày.',
        studyPlanSlug: 'basic-english',
        studyPlanEndLevel: 4,
      },
      {
        id: 'tieng-anh-hang-ngay',
        name: 'Giáo trình Tiếng Anh Hằng ngày',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Level 3-5',
        startLevel: 3,
        endLevel: 5,
        description:
          'Dành cho học viên đã có nền tảng cơ bản. Phát triển kỹ năng giao tiếp trong các tình huống thực tế như giới thiệu bản thân, mua sắm, du lịch, công việc và giao tiếp hằng ngày.',
      },
      {
        id: 'hoi-thoai-theo-chu-de',
        name: 'Giáo trình Hội thoại theo Chủ đề',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Level 2-6',
        startLevel: 2,
        endLevel: 6,
        description:
          'Dành cho học viên mong muốn nâng cao khả năng giao tiếp. Luyện hội thoại theo nhiều chủ đề thực tế, mở rộng vốn từ, cải thiện phản xạ, độ lưu loát và khả năng diễn đạt ý kiến.',
      },
      {
        id: 'tieng-anh-cong-viec',
        name: 'Giáo trình Tiếng Anh Công việc',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Level 4-6',
        startLevel: 4,
        endLevel: 6,
        description:
          'Dành cho sinh viên và người đi làm. Phát triển kỹ năng giao tiếp trong môi trường doanh nghiệp như họp, thuyết trình, viết email, trao đổi với đồng nghiệp và đối tác quốc tế.',
      },
      {
        id: 'giao-tiep-tu-do',
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
        name: 'Giáo trình Phát âm Chuẩn',
        audienceLabel: 'Người lớn',
        rangeLabel: 'Level 1-3',
        startLevel: 1,
        endLevel: 3,
        description:
          'Dành cho học viên muốn cải thiện phát âm tiếng Anh từ nền tảng. Chương trình giúp học viên làm quen với bảng ký hiệu ngữ âm quốc tế, luyện phát âm từng âm, trọng âm, nối âm và ngữ điệu.',
      },
    ],
  },
]
