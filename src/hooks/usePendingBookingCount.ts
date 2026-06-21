import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export function usePendingBookingCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const q = query(
      collection(db, 'bookingRequests'),
      where('status', '==', 'pending')
    )
    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size)
    })
    return unsub
  }, [])

  return count
}
