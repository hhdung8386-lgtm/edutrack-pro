function safeFileBase(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'teacher-photo'
}

function extensionForType(contentType: string) {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  return 'jpg'
}

/** Tải được cả URL Firebase cũ lẫn ảnh base64 đang lưu trong hồ sơ gia sư. */
export async function downloadImage(source: string, fileBase: string) {
  if (!source) throw new Error('IMAGE_NOT_FOUND')

  const response = await fetch(source)
  if (!response.ok) throw new Error('IMAGE_DOWNLOAD_FAILED')
  const blob = await response.blob()
  const objectURL = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectURL
  anchor.download = `${safeFileBase(fileBase)}.${extensionForType(blob.type)}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000)
}
