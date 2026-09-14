import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { HomeworkHtmlAttachment, HomeworkItem } from '@/components/lessons/lessonReport'
import { normalizeHomeworkItems } from '@/components/lessons/lessonReport'
import { storage } from './firebase'
import { validateHomeworkHtmlFile } from './homeworkHtmlValidation'
export { homeworkHtmlErrorMessage } from './homeworkHtmlValidation'

const HOMEWORK_HTML_UPLOAD_TIMEOUT_MS = 60 * 1000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('HOMEWORK_HTML_UPLOAD_TIMEOUT')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function safeDisplayName(fileName: string): string {
  const withoutControls = Array.from(fileName)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .trim()
  return (withoutControls || 'bai-tap.html').slice(0, 160)
}

function safeHeaderName(fileName: string): string {
  const ascii = fileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const stem = (ascii || 'bai-tap.html').slice(-100)
  return /\.html?$/i.test(stem) ? stem : `${stem}.html`
}

async function uploadHomeworkHtml(teacherId: string, file: File): Promise<HomeworkHtmlAttachment> {
  validateHomeworkHtmlFile(file)
  const random = Math.random().toString(36).slice(2, 10)
  const fileRef = ref(storage, `lessons/${teacherId}/homework_${Date.now()}_${random}.html`)
  const displayName = safeDisplayName(file.name)
  const uploadResult = await withTimeout(
    uploadBytes(fileRef, file, {
      contentType: 'text/html; charset=utf-8',
      contentDisposition: `attachment; filename="${safeHeaderName(file.name)}"`,
      cacheControl: 'private, max-age=3600',
      customMetadata: { originalFileName: displayName },
    }),
    HOMEWORK_HTML_UPLOAD_TIMEOUT_MS,
  )
  const fileURL = await withTimeout(getDownloadURL(uploadResult.ref), 30 * 1000)
  return { fileName: displayName, fileURL, sizeBytes: file.size }
}

/**
 * Upload mọi file còn nằm trong form rồi trả về dữ liệu chỉ gồm giá trị có thể lưu Firestore.
 * Nếu một file trong nhóm lỗi, các file vừa tải thành công của cùng lần gửi được dọn lại.
 */
export async function prepareHomeworkItemsForSubmission(
  teacherId: string,
  items: HomeworkItem[],
): Promise<HomeworkItem[]> {
  const normalized = normalizeHomeworkItems(items)
  normalized.forEach((item) => {
    if (item.pendingHtmlFile) validateHomeworkHtmlFile(item.pendingHtmlFile)
  })

  const results = await Promise.allSettled(normalized.map(async (item) => {
    if (!item.pendingHtmlFile) return { item, uploadedNow: false }
    const htmlAttachment = await uploadHomeworkHtml(teacherId, item.pendingHtmlFile)
    return {
      item: { type: item.type, content: item.content, htmlAttachment } satisfies HomeworkItem,
      uploadedNow: true,
    }
  }))

  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failure) {
    await Promise.allSettled(results.map((result) => {
      if (result.status !== 'fulfilled' || !result.value.uploadedNow || !result.value.item.htmlAttachment) return Promise.resolve()
      return deleteObject(ref(storage, result.value.item.htmlAttachment.fileURL))
    }))
    throw failure.reason
  }

  return results.map((result) => (
    result as PromiseFulfilledResult<{ item: HomeworkItem; uploadedNow: boolean }>
  ).value.item)
}
