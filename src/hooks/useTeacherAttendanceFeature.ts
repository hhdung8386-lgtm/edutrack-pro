import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type TeacherAttendanceAccessSnapshot = {
  enabled: boolean
  loading: boolean
  error: boolean
}

type TeacherAttendanceAccessState = TeacherAttendanceAccessSnapshot & {
  teacherId: string | null
}

/** Quyền mở trang Điểm danh bù theo từng hồ sơ gia sư. */
export function useTeacherAttendanceAccess(teacherId?: string | null) {
  const [snapshot, setSnapshot] = useState<TeacherAttendanceAccessState>({
    teacherId: teacherId || null,
    enabled: false,
    loading: Boolean(teacherId),
    error: false,
  })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!teacherId) return

    let active = true

    const stop = onSnapshot(
      doc(db, 'teachers', teacherId),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || snapshot.metadata.fromCache) return
        setSnapshot({
          teacherId,
          enabled: snapshot.data()?.attendancePageEnabled === true,
          loading: false,
          error: false,
        })
      },
      (error) => {
        if (!active) return
        console.error('Unable to load teacher attendance access:', error)
        setSnapshot({ teacherId, enabled: false, loading: false, error: true })
      },
    )

    return () => {
      active = false
      stop()
    }
  }, [retryKey, teacherId])

  const retry = useCallback(() => setRetryKey((current) => current + 1), [])

  const isCurrentTeacher = snapshot.teacherId === (teacherId || null)
  return {
    enabled: isCurrentTeacher ? snapshot.enabled : false,
    loading: Boolean(teacherId) && (!isCurrentTeacher || snapshot.loading),
    error: isCurrentTeacher ? snapshot.error : false,
    retry,
  }
}

export async function setTeacherAttendanceAccess(
  teacherId: string,
  enabled: boolean,
  updatedBy?: string,
) {
  await updateDoc(doc(db, 'teachers', teacherId), {
    attendancePageEnabled: enabled,
    attendancePageUpdatedAt: serverTimestamp(),
    attendancePageUpdatedBy: updatedBy || '',
  })
}
