import { useSyncExternalStore } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SETTINGS_REF = doc(db, 'paymentSettings', 'main')

type AttendanceFeatureSnapshot = {
  enabled: boolean
  loading: boolean
  error: boolean
}

let featureSnapshot: AttendanceFeatureSnapshot = {
  enabled: true,
  loading: true,
  error: false,
}
let stopFeatureListener: (() => void) | null = null
const featureSubscribers = new Set<() => void>()

function publishFeatureSnapshot(next: AttendanceFeatureSnapshot) {
  featureSnapshot = next
  featureSubscribers.forEach((subscriber) => subscriber())
}

function startFeatureListener() {
  if (stopFeatureListener || featureSubscribers.size === 0) return

  publishFeatureSnapshot({ ...featureSnapshot, loading: true, error: false })
  let listenerActive = true
  let stopFirestoreListener = () => {}
  let stopCurrentListener = () => {}
  const loadTimeout = setTimeout(() => {
    if (!listenerActive) return
    stopCurrentListener()
    publishFeatureSnapshot({ ...featureSnapshot, loading: false, error: true })
  }, 12_000)

  stopCurrentListener = () => {
    if (!listenerActive) return
    listenerActive = false
    clearTimeout(loadTimeout)
    stopFirestoreListener()
    if (stopFeatureListener === stopCurrentListener) stopFeatureListener = null
  }

  stopFirestoreListener = onSnapshot(
    SETTINGS_REF,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!listenerActive || snapshot.metadata.fromCache) return
      clearTimeout(loadTimeout)
      publishFeatureSnapshot({
        enabled: snapshot.data()?.teacherAttendancePageEnabled !== false,
        loading: false,
        error: false,
      })
    },
    (error) => {
      if (!listenerActive) return
      console.error('Unable to load teacher attendance feature setting:', error)
      stopCurrentListener()
      // Giữ giá trị đã xác nhận gần nhất nhưng đánh dấu lỗi. Consumer phải hiển
      // thị trạng thái kết nối thay vì tự suy diễn là mở hoặc khóa.
      publishFeatureSnapshot({ ...featureSnapshot, loading: false, error: true })
    },
  )
  stopFeatureListener = stopCurrentListener
}

function subscribeFeature(subscriber: () => void) {
  featureSubscribers.add(subscriber)
  startFeatureListener()
  return () => {
    featureSubscribers.delete(subscriber)
    if (featureSubscribers.size === 0 && stopFeatureListener) {
      stopFeatureListener()
      stopFeatureListener = null
    }
  }
}

function retryFeatureListener() {
  if (stopFeatureListener) stopFeatureListener()
  stopFeatureListener = null
  startFeatureListener()
}

/**
 * Công tắc chỉ dành cho trang Điểm danh độc lập của gia sư.
 *
 * Điểm danh từ Lịch dạy là luồng vận hành chính và không phụ thuộc công tắc này.
 * Mặc định mở để bản triển khai hiện tại khôi phục toàn bộ trang; admin có thể
 * khóa riêng trang độc lập sau khi đã thông báo cho gia sư.
 */
export function useTeacherAttendanceFeature() {
  const snapshot = useSyncExternalStore(
    subscribeFeature,
    () => featureSnapshot,
    () => featureSnapshot,
  )

  return { ...snapshot, retry: retryFeatureListener }
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
