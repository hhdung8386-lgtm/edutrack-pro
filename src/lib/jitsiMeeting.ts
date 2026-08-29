export type OnlineClassroomMeetingProvider = 'public-jitsi' | 'jaas'

export type JitsiLaunchInput = {
  meetingProvider?: OnlineClassroomMeetingProvider
  meetingDomain: string
  meetingAppId?: string
  meetingJwt?: string
  roomName: string
}

export type JitsiLaunchConfig = {
  constructorDomain: string
  scriptUrl: string
  roomName: string
  jwt?: string
}

const SAFE_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?$/i
const SAFE_JAAS_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._~-]{5,199}$/i
const JWT_PATTERN = /^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i

function normalized(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolve the provider-specific IFrame API launch settings without exposing the
 * signed room token in a URL. Missing `meetingProvider` intentionally falls
 * back to public Jitsi so an older callable response still opens during a
 * rolling deployment.
 */
export function resolveJitsiLaunchConfig(input: JitsiLaunchInput): JitsiLaunchConfig {
  const provider = input.meetingProvider ?? 'public-jitsi'
  const domain = normalized(input.meetingDomain).toLowerCase()
  const roomName = normalized(input.roomName)

  if (!SAFE_DOMAIN_PATTERN.test(domain) || !roomName) {
    throw new Error('Thông tin phòng học không hợp lệ.')
  }

  if (provider === 'public-jitsi') {
    return {
      constructorDomain: domain,
      scriptUrl: `https://${domain}/external_api.js`,
      roomName,
    }
  }

  if (provider !== 'jaas') {
    throw new Error('Nhà cung cấp phòng học không hợp lệ.')
  }

  const appId = normalized(input.meetingAppId)
  const jwt = normalized(input.meetingJwt)
  if (
    domain !== '8x8.vc'
    || !SAFE_JAAS_APP_ID_PATTERN.test(appId)
    || !roomName.startsWith(`${appId}/`)
    || roomName.length <= appId.length + 1
    || !JWT_PATTERN.test(jwt)
  ) {
    throw new Error('Thông tin phòng học bảo mật chưa đầy đủ. Vui lòng tải lại trang.')
  }

  return {
    constructorDomain: '8x8.vc',
    scriptUrl: `https://8x8.vc/${encodeURIComponent(appId)}/external_api.js`,
    roomName,
    jwt,
  }
}
