import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
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
// uploadBytes retry rất lâu -> ảnh kẹt spinner mãi và giáo viên không gửi điểm danh được)
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

// Thông báo lỗi upload thân thiện theo nguyên nhân
export function uploadErrorMessage(err: unknown, lang: 'vi' | 'en' = 'vi'): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'UPLOAD_TIMEOUT') {
    return lang === 'vi'
      ? 'Mạng chậm, tải ảnh quá lâu. Ảnh đã được gỡ — vui lòng thử lại hoặc gửi điểm danh không kèm ảnh.'
      : 'Network too slow, upload timed out. The image was removed — please retry or submit without it.'
  }
  if (msg === 'UNSUPPORTED_IMAGE') {
    return lang === 'vi'
      ? 'Định dạng ảnh không được hỗ trợ hoặc ảnh quá lớn. Vui lòng chụp màn hình rồi tải lại.'
      : 'Unsupported image format or file too large. Please use a screenshot instead.'
  }
  return lang === 'vi' ? 'Không thể upload ảnh, vui lòng thử lại' : 'Image upload failed, please try again'
}
