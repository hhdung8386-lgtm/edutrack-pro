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

// Upload a compressed file blob to Firebase Storage and return download URL
export async function uploadLessonImage(teacherId: string, file: File): Promise<string> {
  const compressedBlob = await compressImage(file)
  
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 8)
  const filePath = `lessons/${teacherId}/${timestamp}_${randomStr}.jpg`
  const fileRef = ref(storage, filePath)

  // Upload bytes
  const uploadResult = await uploadBytes(fileRef, compressedBlob, {
    contentType: 'image/jpeg',
  })
  
  // Get and return download URL
  return getDownloadURL(uploadResult.ref)
}
