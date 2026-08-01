import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Lesson } from '@/types'
import { buildStudentAbsenceAlerts } from '@/lib/studentAbsenceAlerts'

export function useStudentAlertCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const absenceQuery = query(
      collection(db, 'lessons'),
      where('attendanceStatus', 'in', ['with_permission', 'without_permission']),
    )
    return onSnapshot(
      absenceQuery,
      (snapshot) => {
        const lessons = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lesson))
        setCount(buildStudentAbsenceAlerts(lessons).length)
      },
      (error) => {
        console.error('Unable to load student absence alert count:', error)
        setCount(0)
      },
    )
  }, [])

  return count
}
