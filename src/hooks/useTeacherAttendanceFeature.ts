import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SETTINGS_REF = doc(db, 'paymentSettings', 'main')

/**
 * Công tắc nghiệp vụ dùng chung cho toàn bộ luồng điểm danh của gia sư.
 *
 * Mặc định khóa khi document/field chưa tồn tại hoặc không đọc được. Cách này
 * bảo đảm yêu cầu vận hành hiện tại không bị vô hiệu chỉ vì cấu hình chưa được
 * khởi tạo. Admin có thể bật lại ngay trong trang Cài đặt.
 */
export function useTeacherAttendanceFeature() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      SETTINGS_REF,
      (snapshot) => {
        setEnabled(snapshot.data()?.teacherAttendanceEnabled === true)
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
      teacherAttendanceEnabled: enabled,
      teacherAttendanceUpdatedAt: serverTimestamp(),
      teacherAttendanceUpdatedBy: updatedBy || '',
    },
    { merge: true },
  )
}
