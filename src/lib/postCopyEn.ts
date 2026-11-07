import type { SitePost } from '@/lib/siteContent'

/**
 * Bản tiếng Anh của các bài viết dựng sẵn, theo slug. Bài khác (admin tự đăng)
 * hiển thị nguyên văn tiếng Việt.
 */
export const POST_COPY_EN: Record<string, Pick<SitePost, 'title' | 'excerpt' | 'body' | 'category'>> = {
  'dau-an-thuong-hieu-giao-duc-2026': {
    title: '123English’s milestone on its journey to build an education brand',
    excerpt: 'Photos from the 2026 awards ceremony capture a memorable milestone in the growth of 123English.',
    body: 'Every recognition is a chance for 123English to look back on the road so far and keep improving the learning experience.\n\nFor 123English, achievement is not only the picture on stage. It is also a learner daring to say their first English sentence, speaking more confidently, overcoming the fear of making mistakes and opening up a new opportunity.\n\nThe 2026 milestone gives the team more motivation to keep investing in teaching methods, tutor quality, progress-tracking technology and support for every family.',
    category: '2026 milestone',
  },
  '2026-ket-noi-voi-thi-truong-quoc-te': {
    title: '2026 | Connecting with the international market',
    excerpt: '123English enters a new stage, connecting learners with tutors, knowledge and opportunities.',
    body: '123English is entering a new stage of growth.\n\nBeyond serving learners in Vietnam, 123English is reaching out to the international market.\n\nConnecting learners with tutors.\nConnecting knowledge with opportunity.\nConnecting different people through a shared language.\n\nLearning English does not end when a course is finished. The journey really begins when learners can use English to go further.',
    category: 'Our journey',
  },
  '2025-mo-rong-he-thong': {
    title: '2025 | Expanding our services',
    excerpt: 'Learning paths, support tools, the tutor team and operations were all developed to create a consistent learning experience.',
    body: '123English continued to grow and refine its 1-on-1 tutoring service.\n\nLearning paths were developed for many needs, from building foundations to real-life communication and advanced English.\n\nAt the same time, support tools, the tutor team and operating processes continued to receive investment to create a consistent learning experience.\n\nBuild better.\nLearn further.\nGrow together.',
    category: 'Our journey',
  },
  '2024-cot-moc-1000-hoc-vien': {
    title: '2024 | Reaching 3,000 learners',
    excerpt: 'Behind the number 3,000 are 3,000 starting points, 3,000 goals and thousands of hours of learning.',
    body: '123English reached 3,000 learners.\n\nBehind that number are 3,000 different learning journeys.\n\n3,000 starting points.\n3,000 goals.\nAnd thousands of hours of learning, practice and progress.\n\nThis milestone reflects the trust of our learner community and motivates the team to keep growing.',
    category: 'Our journey',
  },
  '2023-kien-tao-he-sinh-thai': {
    title: '2023 | Building our support process',
    excerpt: 'From a teaching method, 123English began building a 1-on-1 tutoring service with a consistent support process.',
    body: 'From a teaching method, 123English began building a 1-on-1 tutoring service with a more consistent support process.\n\nLearning paths, the tutor team, guidance processes and tracking tools were connected step by step to support learners throughout their studies.\n\nThis was when 123English transformed: from a learning method into a tutoring service with a clear process.',
    category: 'Our journey',
  },
  '2022-dinh-hinh-phuong-phap': {
    title: '2022 | Shaping the method',
    excerpt: 'The 123 Teaching Method™ is built on three principles: focus, interaction and practice.',
    body: 'After research and development, the 123 Teaching Method™ took shape.\n\nIt is built on three principles:\n\nFocus on one key point.\nInteract through games.\nPractise right in the lesson.\n\nThis became the foundation for how 123English designs lessons and the learning experience.',
    category: 'Method',
  },
  '2021-khoi-nguon': {
    title: '2021 | The beginning',
    excerpt: 'A practical, accessible, learner-centred English tutoring service began to take shape.',
    body: '123English was founded with a clear direction:\n\nTo build a practical, accessible, learner-centred English tutoring service.\n\nFrom the very first steps, 123English began laying the foundation for a longer journey, where English is not just learned from books but used as a tool to connect with the world.',
    category: 'The beginning',
  },
}

export function localizePost(post: SitePost, lang: 'vi' | 'en'): SitePost {
  if (lang !== 'en') return post
  const copy = POST_COPY_EN[post.slug || ''] || POST_COPY_EN[post.id]
  return copy ? { ...post, ...copy } : post
}
