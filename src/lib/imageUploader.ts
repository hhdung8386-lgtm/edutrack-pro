import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

export interface ImageUpload {
  id: string
  file?: File
  base64?: string
  storageURL?: string
  loading?: boolean
  progress?: number
}

// Compress image file using HTML Canvas to max 800px width/height and quality 0.7
export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 800
        let width = img.width
        let height = img.height

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas compression toBlob returned null'))
          }
        }, 'image/jpeg', 0.7)
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Reject sau `ms` mili-giây để upload không bao giờ treo vô hạn (mạng yếu khiến
// uploadBytes retry rất lâu -> ảnh kẹt spinner mãi và gia sư không gửi điểm danh được)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('UPLOAD_TIMEOUT')), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

const UPLOAD_TIMEOUT_MS = 60 * 1000
const MAX_RAW_SIZE = 9.5 * 1024 * 1024 // storage rules chặn >= 10MB

// Upload a compressed file blob to Firebase Storage and return download URL
export async function uploadLessonImage(teacherId: string, file: File): Promise<string> {
  let blob: Blob
  let contentType = 'image/jpeg'
  try {
    blob = await compressImage(file)
  } catch {
    // Trình duyệt không decode được ảnh (vd HEIC trên máy cũ) -> tải file gốc nếu đủ nhỏ
    if (file.size <= MAX_RAW_SIZE) {
      blob = file
      contentType = file.type || 'image/jpeg'
    } else {
      throw new Error('UNSUPPORTED_IMAGE')
    }
  }

  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 8)
  const filePath = `lessons/${teacherId}/${timestamp}_${randomStr}.jpg`
  const fileRef = ref(storage, filePath)

  const uploadResult = await withTimeout(
    uploadBytes(fileRef, blob, { contentType }),
    UPLOAD_TIMEOUT_MS,
  )

  return withTimeout(getDownloadURL(uploadResult.ref), 30 * 1000)
}

export async function uploadTeacherPhoto(teacherId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > MAX_RAW_SIZE) {
    throw new Error('UNSUPPORTED_IMAGE')
  }

  // Gia sư chỉ có một object ảnh tự tải. Đường dẫn cố định kết hợp Storage Rules
  // create-only ngăn việc tạo nhiều ảnh rác; nếu lần trước upload xong nhưng ghi
  // Firestore bị gián đoạn, lần thử sau có thể lấy lại đúng URL của object này.
  const blob = await compressImage(file).catch(() => {
    throw new Error('UNSUPPORTED_IMAGE')
  })
  if (blob.size >= 2 * 1024 * 1024) throw new Error('UNSUPPORTED_IMAGE')

  const filePath = `teacher-photos/${teacherId}/self-profile.jpg`
  const fileRef = ref(storage, filePath)
  try {
    const uploadResult = await withTimeout(
      uploadBytes(fileRef, blob, { contentType: 'image/jpeg' }),
      UPLOAD_TIMEOUT_MS,
    )
    return withTimeout(getDownloadURL(uploadResult.ref), 30 * 1000)
  } catch (uploadError) {
    try {
      return await withTimeout(getDownloadURL(fileRef), 30 * 1000)
    } catch {
      throw uploadError
    }
  }
}

const MAX_TEACHER_INTRO_AUDIO_SIZE = 5 * 1024 * 1024

export function validateTeacherIntroductionAudio(file: File): void {
  const isMp3 = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
  if (!isMp3) throw new Error('UNSUPPORTED_AUDIO')
  if (file.size <= 0 || file.size >= MAX_TEACHER_INTRO_AUDIO_SIZE) throw new Error('AUDIO_TOO_LARGE')
}

/**
 * File giới thiệu dùng đường dẫn cố định để hồ sơ public có thể đọc trực tiếp
 * mà không phải mở rộng DTO Firestore hoặc thay đổi Security Rules.
 */
export async function uploadTeacherIntroductionAudio(teacherId: string, file: File): Promise<string> {
  validateTeacherIntroductionAudio(file)
  const fileRef = ref(storage, `teacher-photos/${teacherId}/introduction.mp3`)
  const uploadResult = await withTimeout(
    uploadBytes(fileRef, file, { contentType: 'audio/mpeg' }),
    UPLOAD_TIMEOUT_MS,
  )
  return withTimeout(getDownloadURL(uploadResult.ref), 30 * 1000)
}

export async function getTeacherIntroductionAudioURL(teacherId: string): Promise<string> {
  if (!teacherId) return ''
  try {
    return await withTimeout(
      getDownloadURL(ref(storage, `teacher-photos/${teacherId}/introduction.mp3`)),
      30 * 1000,
    )
  } catch {
    return ''
  }
}

export function teacherIntroductionAudioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNSUPPORTED_AUDIO') return 'Chỉ hỗ trợ file ghi âm định dạng MP3.'
  if (message === 'AUDIO_TOO_LARGE') return 'File MP3 phải nhỏ hơn 5 MB.'
  if (message === 'UPLOAD_TIMEOUT') return 'Mạng chậm, tải file ghi âm quá lâu. Vui lòng thử lại.'
  return 'Không thể tải file ghi âm. Vui lòng kiểm tra quyền truy cập và thử lại.'
}

/**
 * Ảnh đại diện học viên được nén trước khi tải để giao diện phụ huynh tải nhanh.
 * Tên tệp ngẫu nhiên giúp mỗi lần tải là một object mới, không ghi đè ảnh cũ.
 */
export async function uploadStudentPhoto(studentId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('UNSUPPORTED_IMAGE')
  if (file.size > MAX_RAW_SIZE) throw new Error('UNSUPPORTED_IMAGE')

  const blob = await compressImage(file).catch(() => {
    throw new Error('UNSUPPORTED_IMAGE')
  })
  if (blob.size >= 2 * 1024 * 1024) throw new Error('UNSUPPORTED_IMAGE')
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 10)
  const fileRef = ref(storage, `student-photos/${studentId}/${timestamp}_${randomStr}.jpg`)
  const uploadResult = await withTimeout(
    uploadBytes(fileRef, blob, { contentType: 'image/jpeg' }),
    UPLOAD_TIMEOUT_MS,
  )

  return withTimeout(getDownloadURL(uploadResult.ref), 30 * 1000)
}

export async function deleteUploadedImage(url: string): Promise<void> {
  if (!url) return
  try {
    const fileRef = ref(storage, url)
    await deleteObject(fileRef)
  } catch (err) {
    console.error('Failed to delete image:', err)
  }
}

// Thông báo lỗi upload thân thiện theo nguyên nhân
export function uploadErrorMessage(err: unknown, lang: 'vi' | 'en' = 'vi'): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'UPLOAD_TIMEOUT') {
    return lang === 'vi'
      ? 'Mạng chậm, tải ảnh quá lâu. Vui lòng kiểm tra kết nối rồi thử lại.'
      : 'The upload timed out. Check your connection and try again.'
  }
  if (msg === 'UNSUPPORTED_IMAGE') {
    return lang === 'vi'
      ? 'Định dạng ảnh không được hỗ trợ hoặc ảnh quá lớn. Vui lòng chụp màn hình rồi tải lại.'
      : 'Unsupported image format or file too large. Please use a screenshot instead.'
  }
  return lang === 'vi' ? 'Không thể upload ảnh, vui lòng thử lại' : 'Image upload failed, please try again'
}
