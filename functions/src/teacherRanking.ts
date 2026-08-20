export type TeacherRankingLesson = {
  teacherId?: unknown
  teacherCode?: unknown
  teacherName?: unknown
  date?: unknown
  minutes?: unknown
  status?: unknown
}

export type TeacherRankingProfile = {
  code?: unknown
  name?: unknown
  photoURL?: unknown
  country?: unknown
}

export type TeacherRankingRow = {
  teacherId: string
  displayName: string
  sortName: string
  code: string
  photoURL?: string
  country?: string
  minutes: number
  lessons: number
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function displayName(code: string, name: string): string {
  const releasedNickname = code && !/^GV[A-Z0-9]{4,}$/i.test(code)
  return releasedNickname ? code : name || code || 'Gia sư'
}

export function aggregateTeacherRanking(
  lessons: TeacherRankingLesson[],
  month: string,
  profiles: ReadonlyMap<string, TeacherRankingProfile> = new Map(),
  rowLimit = 10,
): TeacherRankingRow[] {
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`
  const aggregates = new Map<string, TeacherRankingRow>()

  for (const lesson of lessons) {
    const teacherId = text(lesson.teacherId)
    const date = text(lesson.date)
    const minutes = Number(lesson.minutes)
    if (!teacherId || lesson.status !== 'approved' || date < monthStart || date > monthEnd || !Number.isFinite(minutes) || minutes <= 0) {
      continue
    }

    const profile = profiles.get(teacherId)
    const code = text(profile?.code) || text(lesson.teacherCode)
    const name = text(profile?.name) || text(lesson.teacherName) || code || 'Gia sư'
    const current = aggregates.get(teacherId) || {
      teacherId,
      displayName: displayName(code, name),
      sortName: name,
      code,
      photoURL: text(profile?.photoURL) || undefined,
      country: text(profile?.country) || undefined,
      minutes: 0,
      lessons: 0,
    }
    current.minutes += minutes
    current.lessons += 1
    aggregates.set(teacherId, current)
  }

  return Array.from(aggregates.values())
    .sort((left, right) => right.minutes - left.minutes
      || right.lessons - left.lessons
      || left.sortName.localeCompare(right.sortName, 'vi'))
    .slice(0, Math.max(1, rowLimit))
}
