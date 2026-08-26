import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Video } from 'lucide-react'
import type { JitsiEventHandler, JitsiExternalApi } from '@/lib/jitsiExternalApi'

export type JitsiConnectionState = 'loading' | 'joining' | 'connected' | 'ended' | 'error'

type JitsiConstructor = new (
  domain: string,
  options: {
    roomName: string
    parentNode: HTMLElement
    width: string
    height: string
    lang: string
    userInfo: { displayName: string }
    configOverwrite: Record<string, unknown>
  },
) => JitsiExternalApi

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor
  }
}

type JitsiClassroomProps = {
  meetingDomain: string
  roomName: string
  displayName: string
  onApiReady?: (api: JitsiExternalApi | null) => void
  onConferenceJoined?: (participantId: string) => void
  onParticipantJoined?: (participantId: string) => void
  onDataChannelOpened?: () => void
  onTextMessage?: (text: string, senderId: string) => void
  onConnectionStateChange?: (state: JitsiConnectionState) => void
  onEnded?: () => void
  onError?: (message: string) => void
}

const scriptPromises = new Map<string, Promise<void>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isSafeMeetingDomain(domain: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?$/i.test(domain)
}

function loadJitsiScript(domain: string): Promise<void> {
  const existing = scriptPromises.get(domain)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve()
      return
    }

    const scriptId = `jitsi-external-api-${domain.replace(/[^a-z0-9]/gi, '-')}`
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Không tải được trình gọi video.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://${domain}/external_api.js`
    script.async = true
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Không tải được trình gọi video.')), { once: true })
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptPromises.delete(domain)
    throw error
  })

  scriptPromises.set(domain, promise)
  return promise
}

function endpointMessage(payload: unknown): { text: string; senderId: string } | null {
  if (!isRecord(payload)) return null
  const eventData = isRecord(payload.eventData) ? payload.eventData : null
  const senderInfo = isRecord(payload.senderInfo) ? payload.senderInfo : null
  const text = readString(eventData?.text ?? payload.text)
  const senderId = readString(senderInfo?.id ?? payload.senderId)
  return text ? { text, senderId } : null
}

function participantId(payload: unknown): string {
  if (!isRecord(payload)) return ''
  return readString(payload.id ?? payload.participantId)
}

export function JitsiClassroom({
  meetingDomain,
  roomName,
  displayName,
  onApiReady,
  onConferenceJoined,
  onParticipantJoined,
  onDataChannelOpened,
  onTextMessage,
  onConnectionStateChange,
  onEnded,
  onError,
}: JitsiClassroomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef({
    onApiReady,
    onConferenceJoined,
    onParticipantJoined,
    onDataChannelOpened,
    onTextMessage,
    onConnectionStateChange,
    onEnded,
    onError,
  })
  const [state, setState] = useState<JitsiConnectionState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    callbackRef.current = {
      onApiReady,
      onConferenceJoined,
      onParticipantJoined,
      onDataChannelOpened,
      onTextMessage,
      onConnectionStateChange,
      onEnded,
      onError,
    }
  }, [onApiReady, onConferenceJoined, onParticipantJoined, onDataChannelOpened, onTextMessage, onConnectionStateChange, onEnded, onError])

  useEffect(() => {
    let disposed = false
    let api: JitsiExternalApi | null = null
    const listeners: Array<[string, JitsiEventHandler]> = []

    const updateState = (nextState: JitsiConnectionState) => {
      if (disposed) return
      setState(nextState)
      callbackRef.current.onConnectionStateChange?.(nextState)
    }

    const fail = (message: string) => {
      if (disposed) return
      setErrorMessage(message)
      updateState('error')
      callbackRef.current.onError?.(message)
    }

    const addListener = (eventName: string, handler: JitsiEventHandler) => {
      if (!api) return
      api.addEventListener(eventName, handler)
      listeners.push([eventName, handler])
    }

    const mountConference = async () => {
      if (!isSafeMeetingDomain(meetingDomain) || !roomName || !containerRef.current) {
        fail('Thông tin phòng học không hợp lệ.')
        return
      }

      try {
        updateState('loading')
        await loadJitsiScript(meetingDomain)
        if (disposed || !containerRef.current) return
        const ExternalApi = window.JitsiMeetExternalAPI
        if (!ExternalApi) throw new Error('Trình gọi video chưa sẵn sàng.')

        api = new ExternalApi(meetingDomain, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          lang: 'vi',
          userInfo: { displayName },
          configOverwrite: {
            defaultLanguage: 'vi',
            disableInviteFunctions: true,
            disableThirdPartyRequests: true,
            enableWelcomePage: false,
            prejoinConfig: { enabled: true, hideDisplayName: true },
            toolbarButtons: [
              'microphone',
              'camera',
              'desktop',
              'chat',
              'participants-pane',
              'settings',
              'fullscreen',
              'hangup',
            ],
          },
        })

        const iframe = api.getIFrame?.()
        if (iframe) {
          iframe.title = `Lớp học trực tuyến của ${displayName}`
          iframe.setAttribute('allow', 'camera; microphone; display-capture; autoplay; fullscreen')
          iframe.setAttribute('allowfullscreen', 'true')
        }

        addListener('browserSupport', (payload) => {
          if (isRecord(payload) && payload.supported === false) {
            fail('Trình duyệt này chưa hỗ trợ gọi video. Hãy mở bằng Chrome hoặc Edge mới nhất.')
          }
        })
        addListener('videoConferenceJoined', (payload) => {
          updateState('connected')
          callbackRef.current.onConferenceJoined?.(participantId(payload))
        })
        addListener('participantJoined', (payload) => {
          const id = participantId(payload)
          if (id) callbackRef.current.onParticipantJoined?.(id)
        })
        addListener('dataChannelOpened', () => callbackRef.current.onDataChannelOpened?.())
        addListener('endpointTextMessageReceived', (payload) => {
          const message = endpointMessage(payload)
          if (message) callbackRef.current.onTextMessage?.(message.text, message.senderId)
        })
        addListener('readyToClose', () => {
          updateState('ended')
          callbackRef.current.onEnded?.()
        })
        addListener('videoConferenceLeft', () => {
          updateState('ended')
          callbackRef.current.onEnded?.()
        })
        addListener('errorOccurred', (payload) => {
          const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null
          const message = readString(error?.message) || 'Cuộc gọi gặp lỗi. Vui lòng tải lại trang để vào lại.'
          if (error?.isFatal === true) {
            fail(message)
          } else {
            callbackRef.current.onError?.(message)
          }
        })

        updateState('joining')
        callbackRef.current.onApiReady?.(api)
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Không thể khởi tạo cuộc gọi video.')
      }
    }

    void mountConference()

    return () => {
      disposed = true
      for (const [eventName, handler] of listeners) {
        api?.removeEventListener?.(eventName, handler)
      }
      api?.dispose()
      callbackRef.current.onApiReady?.(null)
    }
  }, [meetingDomain, roomName, displayName])

  return (
    <section className="relative h-full min-h-[420px] overflow-hidden rounded-[1.5rem] border border-slate-800 bg-[#070b12] shadow-[0_24px_70px_-48px_rgba(15,23,42,0.85)]" aria-label="Cuộc gọi video">
      <div ref={containerRef} className="absolute inset-0" />

      {(state === 'loading' || state === 'joining') && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#070b12] text-white">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              {state === 'loading' ? <Loader2 className="h-7 w-7 animate-spin text-amber-300" /> : <Video className="h-7 w-7 text-amber-300" />}
            </span>
            <p className="mt-4 text-sm font-bold">{state === 'loading' ? 'Đang tải phòng học' : 'Đang kết nối cuộc gọi'}</p>
            <p className="mt-1 text-xs text-slate-400">Trình duyệt sẽ hỏi quyền camera và micro.</p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b12] px-6 text-white">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" />
            <p className="mt-4 text-base font-extrabold">Chưa thể mở cuộc gọi</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{errorMessage}</p>
          </div>
        </div>
      )}
    </section>
  )
}
