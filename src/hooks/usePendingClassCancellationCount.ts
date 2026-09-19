import { useEffect, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Số yêu cầu huỷ lớp của gia sư đang chờ giáo vụ duyệt (đếm một lần, không giữ listener). */
export function usePendingClassCancellationCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherCancellationStatus', '==', 'pending')
    )
    let active = true
    getCountFromServer(q)
      .then((snap) => {
        if (active) setCount(snap.data().count)
      })
      .catch(() => {
        if (active) setCount(0)
      })

    return () => {
      active = false
    }
  }, [])

  return count
}
