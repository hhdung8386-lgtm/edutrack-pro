const MAX_HOMEWORK_HTML_BYTES = 1024 * 1024

export function validateHomeworkHtmlFile(file: Pick<File, 'name' | 'size'>): void {
  if (!/\.html?$/i.test(file.name)) throw new Error('HOMEWORK_HTML_UNSUPPORTED')
  if (file.size <= 0) throw new Error('HOMEWORK_HTML_EMPTY')
  if (file.size > MAX_HOMEWORK_HTML_BYTES) throw new Error('HOMEWORK_HTML_TOO_LARGE')
}

export function homeworkHtmlErrorMessage(error: unknown, lang: 'vi' | 'en'): string {
  const message = error instanceof Error ? error.message : ''
  if (message === 'HOMEWORK_HTML_UNSUPPORTED') {
    return lang === 'vi' ? 'Chỉ hỗ trợ file có đuôi .html hoặc .htm.' : 'Only .html or .htm files are supported.'
  }
  if (message === 'HOMEWORK_HTML_EMPTY') {
    return lang === 'vi' ? 'File HTML đang trống. Vui lòng chọn lại đúng bài tập.' : 'The HTML file is empty. Choose the correct exercise file.'
  }
  if (message === 'HOMEWORK_HTML_TOO_LARGE') {
    return lang === 'vi' ? 'File HTML phải nhỏ hơn hoặc bằng 1 MB.' : 'The HTML file must be 1 MB or smaller.'
  }
  if (message === 'HOMEWORK_HTML_UPLOAD_TIMEOUT') {
    return lang === 'vi' ? 'Tải bài tập quá lâu. Hãy kiểm tra mạng và gửi lại.' : 'The exercise upload timed out. Check your connection and try again.'
  }
  return lang === 'vi' ? 'Không thể tải bài tập HTML. Vui lòng thử lại.' : 'Could not upload the HTML exercise. Please try again.'
}
