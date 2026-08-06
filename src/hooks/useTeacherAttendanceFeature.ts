import { useSyncExternalStore } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SETTINGS_REF = doc(db, 'paymentSettings', 'main')

type AttendanceFeatureSnapshot = {
  enabled: boolean
  loading: boolean
  error: boolean
}

// MẶC ĐỊNH KHÓA: chưa xác nhận được trạng thái thì coi như đang khóa, không bao giờ
// tự mở trang Điểm danh độc lập khi chưa có lệnh rõ ràng của admin.
let featureSnapshot: AttendanceFeatureSnapshot = {
  enabled: false,
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
        // Phải là `=== true`: doc chưa có / field chưa có -> KHÓA (mặc định an toàn).
        enabled: snapshot.data()?.teacherAttendancePageEnabled === true,
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
 * Điểm danh từ Lịch dạy là luồng vận hành chính và KHÔNG phụ thuộc công tắc này.
 *
 * MẶC ĐỊNH KHÓA (giáo vụ chốt 2026-08-06): gia sư chấm công theo lịch timetable.
 * Khi cần điểm danh bù, gia sư báo admin -> admin mở khóa ở trang Lương gia sư,
 * gia sư thao tác xong thì admin khóa lại.
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
