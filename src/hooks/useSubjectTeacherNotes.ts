import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { normalizeSubjectTeacherNote } from '@/lib/subjectTeacherNote'

// Gia sư chỉ cần chú thích của vài môn đang dạy: đọc từng document theo id,
// dùng chung bộ nhớ đệm cho mọi trang để không lặp lại lượt đọc Firestore.
const CACHE_TTL_MS = 10 * 60 * 1000
const RETRY_AFTER_ERROR_MS = 60 * 1000
const cache = new Map<string, { note: string; expiresAt: number }>()
const inflight = new Map<string, Promise<void>>()

function loadNote(subjectId: string) {
  let pending = inflight.get(subjectId)
  if (!pending) {
    pending = getDoc(doc(db, 'subjects', subjectId))
      .then((snapshot) => {
        const note = snapshot.exists() ? normalizeSubjectTeacherNote(snapshot.data().teacherNote) : ''
        cache.set(subjectId, { note, expiresAt: Date.now() + CACHE_TTL_MS })
      })
      .catch((error) => {
        console.warn('Unable to load subject note:', subjectId, error)
        cache.set(subjectId, { note: '', expiresAt: Date.now() + RETRY_AFTER_ERROR_MS })
      })
      .finally(() => inflight.delete(subjectId))
    inflight.set(subjectId, pending)
  }
  return pending
}

/** Trả về { subjectId: chú thích } cho các môn có chú thích; môn chưa có chú thích không xuất hiện. */
export function useSubjectTeacherNotes(subjectIds: Array<string | null | undefined>) {
  const key = Array.from(new Set(subjectIds.map((id) => String(id ?? '').trim()).filter(Boolean))).sort().join('|')
  const [loadedVersion, setLoadedVersion] = useState(0)

  useEffect(() => {
    if (!key) return
    const now = Date.now()
    const missing = key.split('|').filter((id) => (cache.get(id)?.expiresAt ?? 0) <= now)
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(loadNote)).then(() => {
      if (!cancelled) setLoadedVersion((version) => version + 1)
    })
    return () => { cancelled = true }
  }, [key])

  return useMemo(() => {
    const notes: Record<string, string> = {}
    if (!key) return notes
    key.split('|').forEach((id) => {
      const note = cache.get(id)?.note
      if (note) notes[id] = note
    })
    return notes
    // loadedVersion báo bộ nhớ đệm vừa có dữ liệu mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadedVersion])
}
