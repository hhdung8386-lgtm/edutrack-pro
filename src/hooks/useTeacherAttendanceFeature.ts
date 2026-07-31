import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SETTINGS_REF = doc(db, 'paymentSettings', 'main')

/**
 * Công tắc chỉ dành cho trang Điểm danh độc lập của gia sư.
 *
 * Điểm danh từ Lịch dạy là luồng vận hành chính và không phụ thuộc công tắc này.
 * Mặc định mở để bản triển khai hiện tại khôi phục toàn bộ trang; admin có thể
 * khóa riêng trang độc lập sau khi đã thông báo cho gia sư.
 */
export function useTeacherAttendanceFeature() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      SETTINGS_REF,
      (snapshot) => {
        setEnabled(snapshot.data()?.teacherAttendancePageEnabled !== false)
        setLoading(false)
      },
      (error) => {
        console.error('Unable to load teacher attendance feature setting:', error)
        setEnabled(false)
        setLoading(false)
      },
    )
  }, [])

  return { enabled, loading }
}

export async function setTeacherAttendanceFeature(enabled: boolean, updatedBy?: string) {
  await setDoc(
    SETTINGS_REF,
    {
      teacherAttendancePageEnabled: enabled,
      teacherAttendancePageUpdatedAt: serverTimestamp(),
      teacherAttendancePageUpdatedBy: updatedBy || '',
    },
    { merge: true },
  )
}
