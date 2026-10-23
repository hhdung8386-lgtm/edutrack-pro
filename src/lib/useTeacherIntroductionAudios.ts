import { useCallback, useEffect, useRef, useState } from 'react'
import { getTeacherIntroductionAudioURL, teacherIntroductionAudioErrorMessage, uploadTeacherIntroductionAudio } from '@/lib/imageUploader'
import { toast } from '@/stores/toastStore'

export type AudioState = { status: 'loading' | 'ready' | 'error' | 'uploading'; url: string }

// One lookup per displayed teacher, shared by desktop and mobile presentations.
export function useTeacherIntroductionAudios(teacherIds: string, revision: number) {
  const [states, setStates] = useState<Record<string, AudioState>>({})
  const pendingUploads = useRef(new Set<string>())
  const requests = useRef<Record<string, number>>({})

  const load = useCallback(async (id: string, isActive: () => boolean = () => true) => {
    if (pendingUploads.current.has(id)) return
    const request = (requests.current[id] || 0) + 1
    requests.current[id] = request
    setStates(current => ({ ...current, [id]: { status: 'loading', url: current[id]?.url || '' } }))
    try {
      const url = await getTeacherIntroductionAudioURL(id, true)
      if (isActive() && requests.current[id] === request) {
        setStates(current => ({ ...current, [id]: { status: 'ready', url: url ? `${url}&v=${Date.now()}` : '' } }))
      }
    } catch {
      if (isActive() && requests.current[id] === request) {
        setStates(current => ({ ...current, [id]: { status: 'error', url: current[id]?.url || '' } }))
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    const ids: string[] = JSON.parse(teacherIds)
    ids.forEach(id => { void load(id, () => active) })
    return () => { active = false }
  }, [teacherIds, revision, load])

  async function upload(id: string, file: File) {
    if (pendingUploads.current.has(id)) return
    const previous = states[id]
    pendingUploads.current.add(id)
    requests.current[id] = (requests.current[id] || 0) + 1
    setStates(current => ({ ...current, [id]: { status: 'uploading', url: current[id]?.url || '' } }))
    try {
      const url = await uploadTeacherIntroductionAudio(id, file)
      setStates(current => ({ ...current, [id]: { status: 'ready', url: `${url}&v=${Date.now()}` } }))
      toast.success('Đã lưu ghi âm giới thiệu.')
    } catch (error) {
      // Keep the previous recording available when replacement fails.
      setStates(current => ({ ...current, [id]: previous || { status: 'error', url: '' } }))
      toast.error(teacherIntroductionAudioErrorMessage(error))
    } finally {
      pendingUploads.current.delete(id)
    }
  }

  return { states, upload, reload: (id: string) => { void load(id) } }
}
