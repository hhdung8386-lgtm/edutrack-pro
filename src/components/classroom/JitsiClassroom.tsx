import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, Video } from 'lucide-react'
import type { JitsiEventHandler, JitsiExternalApi } from '@/lib/jitsiExternalApi'
import {
  jitsiClassroomToolbarButtons,
  parseJitsiKnockingParticipant,
  type JitsiKnockingParticipant,
} from '@/lib/jitsiClassroomControls'
import {
  resolveJitsiLaunchConfig,
  type OnlineClassroomMeetingProvider,
} from '@/lib/jitsiMeeting'

export type JitsiConnectionState = 'loading' | 'joining' | 'connected' | 'ended' | 'error'

export type JitsiScreenShareState = {
  active: boolean
  local: boolean
  participantIds: string[]
}

export type { JitsiKnockingParticipant } from '@/lib/jitsiClassroomControls'

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
    jwt?: string
    onload?: () => void
  },
) => JitsiExternalApi

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor
  }
}

type JitsiClassroomProps = {
  meetingProvider?: OnlineClassroomMeetingProvider
  meetingDomain: string
  meetingAppId?: string
  meetingJwt?: string
  roomName: string
  displayName: string
  observerMode?: boolean
  canShareScreen?: boolean
  manageWaitingRoom?: boolean
  scheduledDurationSeconds?: number
  scheduledElapsedSeconds?: number
  onApiReady?: (api: JitsiExternalApi | null) => void
  onConferenceJoined?: (participantId: string) => void
  onParticipantJoined?: (participantId: string) => void
  onParticipantLeft?: (participantId: string) => void
  onWaitingRoomReadyChange?: (ready: boolean) => void
  onKnockingParticipant?: (participant: JitsiKnockingParticipant) => void
  onDataChannelOpened?: () => void
  onTextMessage?: (text: string, senderId: string) => void
  onScreenShareStateChange?: (state: JitsiScreenShareState) => void
  onConnectionStateChange?: (state: JitsiConnectionState) => void
  onEnded?: () => void
  onError?: (message: string) => void
}

const scriptPromises = new Map<string, Promise<void>>()
let loadedScriptUrl = ''
const JITSI_LOAD_TIMEOUT_MS = 30_000

type MediaKind = 'camera' | 'microphone'
type MediaWarnings = Partial<Record<MediaKind, string>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function jitsiScriptId(scriptUrl: string): string {
  return `jitsi-external-api-${scriptUrl.replace(/[^a-z0-9]/gi, '-')}`
}

function resetJitsiScript(scriptUrl: string): void {
  scriptPromises.delete(scriptUrl)
  document.getElementById(jitsiScriptId(scriptUrl))?.remove()
  if (loadedScriptUrl === scriptUrl) loadedScriptUrl = ''
}

function loadJitsiScript(scriptUrl: string): Promise<void> {
  const existing = scriptPromises.get(scriptUrl)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const scriptId = jitsiScriptId(scriptUrl)
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (window.JitsiMeetExternalAPI && (loadedScriptUrl === scriptUrl || existingScript?.dataset.loaded === 'true')) {
      resolve()
      return
    }

    // Nếu thẻ script còn tồn tại mà API chưa có thì đó là lần tải cũ đã lỗi.
    // Xóa thẻ cũ để nút thử lại luôn tạo một request mới, có thể hoàn tất.
    existingScript?.remove()

    const script = document.createElement('script')
    script.id = scriptId
    script.src = scriptUrl
    script.async = true
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    script.addEventListener('load', () => {
      loadedScriptUrl = scriptUrl
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error('Không tải được trình gọi video. Hãy kiểm tra mạng rồi thử lại.'))
    }, { once: true })
    document.head.appendChild(script)
  })

  scriptPromises.set(scriptUrl, promise)
  void promise.catch(() => {
    if (scriptPromises.get(scriptUrl) === promise) scriptPromises.delete(scriptUrl)
  })
  return promise
}

function mediaErrorMessage(kind: MediaKind, payload: unknown): string {
  const details = isRecord(payload) ? payload : null
  const rawError = `${readString(details?.type)} ${readString(details?.message)}`.toLowerCase()
  const device = kind === 'camera' ? 'camera' : 'micro'

  if (/permission|notallowed|denied/.test(rawError)) {
    return `${kind === 'camera' ? 'Camera' : 'Micro'} đang bị chặn. Hãy bấm biểu tượng camera hoặc ổ khóa cạnh thanh địa chỉ, chọn Cho phép, rồi thử lại cuộc gọi.`
  }
  if (/not.?found|devices?.?not.?found/.test(rawError)) {
    return `Không tìm thấy ${device}. Hãy kiểm tra kết nối thiết bị hoặc chọn thiết bị khác trong phần cài đặt cuộc gọi.`
  }
  if (/not.?readable|track.?start|in.?use|could.?not.?start/.test(rawError)) {
    return `${kind === 'camera' ? 'Camera' : 'Micro'} có thể đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại cuộc gọi.`
  }
  if (/constraint|overconstrained/.test(rawError)) {
    return `Thiết lập ${device} hiện tại không tương thích. Hãy chọn thiết bị khác trong phần cài đặt cuộc gọi.`
  }
  return `Chưa thể mở ${device}. Hãy kiểm tra quyền trình duyệt và thiết bị, sau đó thử lại cuộc gọi.`
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

function uniqueParticipantIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  const ids = new Set<string>()
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const id = candidate.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

function contentSharingParticipantIds(payload: unknown): string[] | null {
  if (!isRecord(payload)) return null
  return uniqueParticipantIds(payload.data)
}

function initialContentSharingParticipantIds(payload: unknown): string[] | null {
  if (!isRecord(payload)) return null
  return uniqueParticipantIds(payload.sharingParticipantIds)
}

function localScreenSharingStatus(payload: unknown): boolean | null {
  if (!isRecord(payload) || typeof payload.on !== 'boolean') return null
  return payload.on
}

export function JitsiClassroom({
  meetingProvider,
  meetingDomain,
  meetingAppId,
  meetingJwt,
  roomName,
  displayName,
  observerMode = false,
  canShareScreen = false,
  manageWaitingRoom = false,
  scheduledDurationSeconds = 0,
  scheduledElapsedSeconds = 0,
  onApiReady,
  onConferenceJoined,
  onParticipantJoined,
  onParticipantLeft,
  onWaitingRoomReadyChange,
  onKnockingParticipant,
  onDataChannelOpened,
  onTextMessage,
  onScreenShareStateChange,
  onConnectionStateChange,
  onEnded,
  onError,
}: JitsiClassroomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef({
    onApiReady,
    onConferenceJoined,
    onParticipantJoined,
    onParticipantLeft,
    onWaitingRoomReadyChange,
    onKnockingParticipant,
    onDataChannelOpened,
    onTextMessage,
    onScreenShareStateChange,
    onConnectionStateChange,
    onEnded,
    onError,
  })
  const [hasStarted, setHasStarted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<JitsiConnectionState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [mediaWarnings, setMediaWarnings] = useState<MediaWarnings>({})
  const meetingJwtRef = useRef(meetingJwt)

  useEffect(() => {
    meetingJwtRef.current = meetingJwt
  }, [meetingJwt])

  useEffect(() => {
    callbackRef.current = {
      onApiReady,
      onConferenceJoined,
      onParticipantJoined,
      onParticipantLeft,
      onWaitingRoomReadyChange,
      onKnockingParticipant,
      onDataChannelOpened,
      onTextMessage,
      onScreenShareStateChange,
      onConnectionStateChange,
      onEnded,
      onError,
    }
  }, [onApiReady, onConferenceJoined, onParticipantJoined, onParticipantLeft, onWaitingRoomReadyChange, onKnockingParticipant, onDataChannelOpened, onTextMessage, onScreenShareStateChange, onConnectionStateChange, onEnded, onError])

  useEffect(() => {
    if (!hasStarted) return

    let disposed = false
    let failed = false
    let api: JitsiExternalApi | null = null
    let loadTimeout: number | null = null
    let activeScriptUrl = ''
    const listeners: Array<[string, JitsiEventHandler]> = []
    const parentNode = containerRef.current
    let localParticipantId = ''
    let localScreenShareActive = false
    let localScreenShareStatusKnown = false
    let sharingParticipantIds: string[] = []
    let lastScreenShareState: JitsiScreenShareState | null = null
    let presentationLayoutActive = false
    let focusedPresenterId = ''
    let waitingRoomReady = false

    const clearLoadTimeout = () => {
      if (loadTimeout === null) return
      window.clearTimeout(loadTimeout)
      loadTimeout = null
    }

    const updateState = (nextState: JitsiConnectionState) => {
      if (disposed || failed) return
      setState(nextState)
      callbackRef.current.onConnectionStateChange?.(nextState)
    }

    const removeListeners = () => {
      for (const [eventName, handler] of listeners) {
        api?.removeEventListener?.(eventName, handler)
      }
      listeners.length = 0
    }

    const currentScreenShareState = (): JitsiScreenShareState => {
      let participantIds = [...sharingParticipantIds]
      if (localParticipantId && localScreenShareStatusKnown) {
        participantIds = localScreenShareActive
          ? [localParticipantId, ...participantIds.filter((id) => id !== localParticipantId)]
          : participantIds.filter((id) => id !== localParticipantId)
      }

      const local = localScreenShareStatusKnown
        ? localScreenShareActive
        : Boolean(localParticipantId && participantIds.includes(localParticipantId))

      return {
        active: local || participantIds.length > 0,
        local,
        participantIds,
      }
    }

    const isSameScreenShareState = (left: JitsiScreenShareState | null, right: JitsiScreenShareState) => (
      left?.active === right.active
      && left.local === right.local
      && left.participantIds.length === right.participantIds.length
      && left.participantIds.every((id, index) => id === right.participantIds[index])
    )

    const applyPresentationLayout = (screenShareState: JitsiScreenShareState) => {
      if (!api || disposed || failed) return
      if (!screenShareState.active) {
        if (presentationLayoutActive) {
          try {
            api.executeCommand('setTileView', true)
          } catch {
            // Giữ bố cục hiện tại nếu deployment không hỗ trợ setTileView.
          }
        }
        presentationLayoutActive = false
        focusedPresenterId = ''
        return
      }

      if (!presentationLayoutActive) {
        presentationLayoutActive = true
        try {
          api.executeCommand('setTileView', false)
        } catch {
          // Một số bản Jitsi cũ không hỗ trợ lệnh này; giữ nguyên bố cục hiện tại.
        }
      }

      const presenterId = screenShareState.participantIds[0] ?? ''
      if (!presenterId || presenterId === focusedPresenterId) return
      focusedPresenterId = presenterId
      try {
        api.executeCommand('setLargeVideoParticipant', presenterId, 'desktop')
      } catch {
        // Jitsi vẫn tự đưa màn hình chia sẻ lên sân khấu nếu API ghim không có sẵn.
      }
    }

    const emitScreenShareState = (force = false) => {
      const screenShareState = currentScreenShareState()
      applyPresentationLayout(screenShareState)
      if (!force && isSameScreenShareState(lastScreenShareState, screenShareState)) return
      lastScreenShareState = {
        ...screenShareState,
        participantIds: [...screenShareState.participantIds],
      }
      callbackRef.current.onScreenShareStateChange?.({
        ...screenShareState,
        participantIds: [...screenShareState.participantIds],
      })
    }

    const updateSharingParticipantIds = (participantIds: string[]) => {
      sharingParticipantIds = [...participantIds]
      emitScreenShareState()
    }

    const resetScreenShareState = () => {
      localParticipantId = ''
      localScreenShareActive = false
      localScreenShareStatusKnown = false
      sharingParticipantIds = []
      presentationLayoutActive = false
      focusedPresenterId = ''
      emitScreenShareState()
    }

    const disposeConference = () => {
      if (waitingRoomReady) callbackRef.current.onWaitingRoomReadyChange?.(false)
      waitingRoomReady = false
      resetScreenShareState()
      removeListeners()
      const currentApi = api
      api = null
      try {
        currentApi?.dispose()
      } catch {
        // Jitsi có thể đã tự đóng iframe trước khi cleanup chạy.
      }
      parentNode?.replaceChildren()
      callbackRef.current.onApiReady?.(null)
    }

    const fail = (message: string) => {
      if (disposed || failed) return
      failed = true
      const waitingForLoad = loadTimeout !== null
      clearLoadTimeout()
      if (waitingForLoad && activeScriptUrl) resetJitsiScript(activeScriptUrl)
      setErrorMessage(message)
      setState('error')
      callbackRef.current.onConnectionStateChange?.('error')
      callbackRef.current.onError?.(message)
      disposeConference()
    }

    const addListener = (eventName: string, handler: JitsiEventHandler) => {
      if (!api) return
      api.addEventListener(eventName, handler)
      listeners.push([eventName, handler])
    }

    const refreshContentSharingParticipants = async () => {
      const currentApi = api
      if (!currentApi?.getContentSharingParticipants) {
        emitScreenShareState()
        return
      }

      try {
        const payload = await currentApi.getContentSharingParticipants()
        if (disposed || failed || api !== currentApi) return
        const participantIds = initialContentSharingParticipantIds(payload)
        if (participantIds) updateSharingParticipantIds(participantIds)
        else emitScreenShareState()
      } catch {
        // Đây là dữ liệu hỗ trợ bố cục. Cuộc gọi vẫn tiếp tục nếu API cũ không trả được.
        if (!disposed && !failed && api === currentApi) emitScreenShareState()
      }
    }

    const reportMediaError = (kind: MediaKind, payload: unknown) => {
      if (disposed || failed) return
      const message = mediaErrorMessage(kind, payload)
      setMediaWarnings((current) => ({ ...current, [kind]: message }))
      callbackRef.current.onError?.(message)
    }

    const enableWaitingRoomForModerator = () => {
      if (!api || !manageWaitingRoom || waitingRoomReady) return
      try {
        // SETTINGS_PROVISIONING bật lobby từ phía JaaS. Lệnh idempotent này là
        // lớp dự phòng cho pilot và chỉ chạy sau khi JWT được xác nhận moderator.
        api.executeCommand('toggleLobby', true)
        waitingRoomReady = true
        callbackRef.current.onWaitingRoomReadyChange?.(true)
      } catch {
        callbackRef.current.onWaitingRoomReadyChange?.(false)
      }
    }

    const clearMediaWarning = (kind: MediaKind) => {
      setMediaWarnings((current) => {
        if (!current[kind]) return current
        const next = { ...current }
        delete next[kind]
        return next
      })
    }

    const mountConference = async () => {
      if (!parentNode) {
        fail('Thông tin phòng học không hợp lệ.')
        return
      }

      try {
        const launch = resolveJitsiLaunchConfig({
          meetingProvider,
          meetingDomain,
          meetingAppId,
          meetingJwt: meetingJwtRef.current,
          roomName,
        })
        activeScriptUrl = launch.scriptUrl
        setErrorMessage('')
        setMediaWarnings({})
        updateState('loading')
        loadTimeout = window.setTimeout(() => {
          fail('Phòng học tải quá lâu. Hãy kiểm tra mạng rồi thử lại.')
        }, JITSI_LOAD_TIMEOUT_MS)
        await loadJitsiScript(launch.scriptUrl)
        if (disposed || failed) return
        const ExternalApi = window.JitsiMeetExternalAPI
        if (!ExternalApi) {
          resetJitsiScript(launch.scriptUrl)
          throw new Error('Trình gọi video chưa sẵn sàng. Hãy thử lại.')
        }

        const toolbarButtons = jitsiClassroomToolbarButtons(canShareScreen)

        api = new ExternalApi(launch.constructorDomain, {
          roomName: launch.roomName,
          parentNode,
          width: '100%',
          height: '100%',
          lang: 'vi',
          userInfo: { displayName },
          ...(launch.jwt ? { jwt: launch.jwt } : {}),
          onload: () => {
            if (disposed || failed) return
            clearLoadTimeout()
            updateState('joining')
          },
          configOverwrite: {
            defaultLanguage: 'vi',
            disableInviteFunctions: true,
            disableRemoteMute: true,
            disableThirdPartyRequests: true,
            enableNoAudioDetection: true,
            enableNoisyMicDetection: true,
            enableWelcomePage: false,
            desktopSharingFrameRate: { min: 5, max: 15 },
            resolution: 720,
            startWithAudioMuted: observerMode,
            startWithVideoMuted: observerMode,
            participantsPane: {
              hideModeratorSettingsTab: true,
              hideMoreActionsButton: true,
              hideMuteAllButton: true,
            },
            prejoinConfig: { enabled: true, hideDisplayName: true },
            lobby: { autoKnock: true, enableChat: false },
            toolbarButtons,
          },
        })

        const iframe = api.getIFrame?.()
        if (iframe) {
          iframe.title = `Lớp học trực tuyến của ${displayName}`
          iframe.setAttribute(
            'allow',
            canShareScreen
              ? 'camera; microphone; display-capture; autoplay'
              : 'camera; microphone; autoplay',
          )
          iframe.removeAttribute('allowfullscreen')
        }

        addListener('browserSupport', (payload) => {
          if (isRecord(payload) && payload.supported === false) {
            fail('Trình duyệt này chưa hỗ trợ gọi video. Hãy mở bằng Chrome hoặc Edge mới nhất.')
          }
        })
        addListener('videoConferenceJoined', (payload) => {
          clearLoadTimeout()
          updateState('connected')
          localParticipantId = participantId(payload)
          emitScreenShareState()
          callbackRef.current.onConferenceJoined?.(localParticipantId)
          if (scheduledDurationSeconds > 0) {
            try {
              api?.executeCommand('setMeetingTimer', {
                duration: Math.floor(scheduledDurationSeconds),
                elapsed: Math.max(0, Math.floor(scheduledElapsedSeconds)),
              })
            } catch {
              // Đồng hồ ngoài iframe vẫn hoạt động nếu deployment chưa hỗ trợ.
            }
          }
          void refreshContentSharingParticipants()
        })
        addListener('participantRoleChanged', (payload) => {
          if (isRecord(payload) && payload.role === 'moderator') enableWaitingRoomForModerator()
        })
        addListener('knockingParticipant', (payload) => {
          const participant = parseJitsiKnockingParticipant(payload)
          if (participant) callbackRef.current.onKnockingParticipant?.(participant)
        })
        addListener('participantJoined', (payload) => {
          const id = participantId(payload)
          if (id) callbackRef.current.onParticipantJoined?.(id)
        })
        addListener('participantLeft', (payload) => {
          const id = participantId(payload)
          if (id) {
            if (sharingParticipantIds.includes(id)) {
              updateSharingParticipantIds(sharingParticipantIds.filter((participant) => participant !== id))
            }
            callbackRef.current.onParticipantLeft?.(id)
          }
        })
        addListener('dataChannelOpened', () => callbackRef.current.onDataChannelOpened?.())
        addListener('endpointTextMessageReceived', (payload) => {
          const message = endpointMessage(payload)
          if (message) callbackRef.current.onTextMessage?.(message.text, message.senderId)
        })
        addListener('contentSharingParticipantsChanged', (payload) => {
          const participantIds = contentSharingParticipantIds(payload)
          if (participantIds) updateSharingParticipantIds(participantIds)
        })
        addListener('screenSharingStatusChanged', (payload) => {
          const active = localScreenSharingStatus(payload)
          if (active === null) return

          localScreenShareStatusKnown = true
          localScreenShareActive = active
          if (localParticipantId) {
            sharingParticipantIds = active
              ? [localParticipantId, ...sharingParticipantIds.filter((id) => id !== localParticipantId)]
              : sharingParticipantIds.filter((id) => id !== localParticipantId)
          }
          emitScreenShareState()
        })
        addListener('cameraError', (payload) => reportMediaError('camera', payload))
        addListener('micError', (payload) => reportMediaError('microphone', payload))
        addListener('videoAvailabilityChanged', (payload) => {
          if (isRecord(payload) && payload.available === true) clearMediaWarning('camera')
        })
        addListener('audioAvailabilityChanged', (payload) => {
          if (isRecord(payload) && payload.available === true) clearMediaWarning('microphone')
        })
        addListener('readyToClose', () => {
          resetScreenShareState()
          updateState('ended')
          callbackRef.current.onEnded?.()
        })
        addListener('videoConferenceLeft', () => {
          resetScreenShareState()
          updateState('ended')
          callbackRef.current.onEnded?.()
        })
        addListener('errorOccurred', (payload) => {
          const event = isRecord(payload) ? payload : null
          const error = event && isRecord(event.error) ? event.error : event
          const message = readString(error?.message) || 'Cuộc gọi gặp lỗi. Vui lòng tải lại trang để vào lại.'
          if (error?.isFatal === true) {
            // Theo IFrame API, lỗi fatal đã kích hoạt lớp reconnect của Jitsi.
            // Không dispose iframe ở đây vì sẽ cắt luôn cơ chế tự nối lại khi
            // Wi-Fi chập chờn; người dùng vẫn thấy hướng dẫn ngay trong cuộc gọi.
            return
          } else {
            callbackRef.current.onError?.(message)
          }
        })

        callbackRef.current.onApiReady?.(api)
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Không thể khởi tạo cuộc gọi video.')
      }
    }

    void mountConference()

    return () => {
      disposed = true
      clearLoadTimeout()
      disposeConference()
    }
  }, [attempt, canShareScreen, displayName, hasStarted, manageWaitingRoom, meetingAppId, meetingDomain, meetingProvider, observerMode, roomName, scheduledDurationSeconds, scheduledElapsedSeconds])

  const startConference = () => {
    setErrorMessage('')
    setMediaWarnings({})
    setState('loading')
    setHasStarted(true)
  }

  const retryConference = () => {
    setErrorMessage('')
    setMediaWarnings({})
    setState('loading')
    setAttempt((current) => current + 1)
  }

  const warningMessages = Object.values(mediaWarnings).filter((message): message is string => Boolean(message))

  return (
    <section className="relative h-full min-h-0 overflow-hidden rounded-[1.5rem] border border-slate-800 bg-[#070b12] shadow-[0_24px_70px_-48px_rgba(15,23,42,0.85)]" aria-label="Cuộc gọi video">
      <div ref={containerRef} className="absolute inset-0" />

      {!hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b12] px-5 text-white">
          <div className="w-full max-w-md text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/10 ring-1 ring-amber-200/20">
              <Video className="h-7 w-7 text-amber-300" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold">Sẵn sàng vào lớp?</h2>
            <p id="jitsi-start-help" className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">
              Sau khi bấm, phòng học sẽ mở màn hình kiểm tra thiết bị. Hãy cho phép camera, micro và bấm Vào lớp trong khung cuộc gọi.
            </p>
            <button
              type="button"
              aria-describedby="jitsi-start-help"
              onClick={startConference}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ffc107] px-5 text-sm font-extrabold text-[#10213a] shadow-[0_12px_30px_-18px_rgba(255,193,7,0.9)] transition hover:bg-[#ffd54f] focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#070b12] active:translate-y-px sm:w-auto"
            >
              <Video className="h-5 w-5" aria-hidden="true" />
              Vào lớp và bật camera, micro
            </button>
          </div>
        </div>
      )}

      {hasStarted && state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#070b12] text-white" role="status" aria-live="polite">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Loader2 className="h-7 w-7 animate-spin text-amber-300" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-bold">Đang mở màn hình kiểm tra thiết bị</p>
            <p className="mt-1 text-xs text-slate-400">Vui lòng chờ trong giây lát.</p>
          </div>
        </div>
      )}

      {hasStarted && state !== 'loading' && state !== 'error' && warningMessages.length > 0 && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1] flex justify-end">
          <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-amber-300/40 bg-slate-950/95 p-3 text-white shadow-xl" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">Cần kiểm tra thiết bị</p>
                {warningMessages.map((message) => (
                  <p key={message} className="mt-1 text-xs leading-5 text-slate-200">{message}</p>
                ))}
                <button
                  type="button"
                  onClick={retryConference}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-200/30 bg-amber-300 px-3 text-xs font-extrabold text-[#10213a] hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-slate-950 active:translate-y-px"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Thử lại cuộc gọi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b12] px-6 text-white">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" />
            <p className="mt-4 text-base font-extrabold">Chưa thể mở cuộc gọi</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{errorMessage}</p>
            <button
              type="button"
              onClick={retryConference}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ffc107] px-4 text-sm font-extrabold text-[#10213a] hover:bg-[#ffd54f] focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#070b12] active:translate-y-px"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Thử lại cuộc gọi
            </button>
          </div>
        </div>
      )}

      {hasStarted && state === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b12] px-6 text-white">
          <div className="max-w-md text-center">
            <Video className="mx-auto h-10 w-10 text-amber-300" aria-hidden="true" />
            <p className="mt-4 text-base font-extrabold">Bạn đã rời cuộc gọi</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Bảng học vẫn được giữ theo buổi. Bạn có thể vào lại cuộc gọi nếu lớp chưa kết thúc.</p>
            <button
              type="button"
              onClick={retryConference}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ffc107] px-4 text-sm font-extrabold text-[#10213a] hover:bg-[#ffd54f] focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#070b12] active:translate-y-px"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Vào lại cuộc gọi
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {hasStarted && state === 'joining' ? 'Màn hình kiểm tra camera và micro đã sẵn sàng. Hãy hoàn tất các bước trong khung cuộc gọi.' : ''}
      </p>
    </section>
  )
}
