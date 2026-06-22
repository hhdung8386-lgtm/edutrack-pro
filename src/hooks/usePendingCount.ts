import { useEffect, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export function usePendingCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const q = query(
      collection(db, 'lessons'),
      where('status', '==', 'pending')
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
