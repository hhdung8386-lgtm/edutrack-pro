import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Copy, ExternalLink, KeyRound, LockKeyhole, Video } from 'lucide-react'
import type { BookingRequest } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  classroomRoute,
  getOnlineClassroomPilotStatus,
  issueOnlineClassroomInvite,
  onlineClassroomErrorMessage,
  rotateOnlineClassroomTeacherPassword,
  setOnlineClassroomPilotAccess,
  type OnlineClassroomTargetType,
} from '@/lib/onlineClassroom'

const RECENT_VIETNAM_DATE = new Date(Date.now() + 7 * 60 * 60 * 1_000 - 24 * 60 * 60 * 1_000)
  .toISOString()
  .slice(0, 10)

type Props = {
  targetType: OnlineClassroomTargetType
  targetId: string
  targetName: string
  mirroredEnabled?: boolean
  bookings?: BookingRequest[]
  onUpdated?: (enabled: boolean) => void
}

export function OnlineClassroomPilotCard({
  targetType,
  targetId,
  targetName,
  mirroredEnabled,
  bookings = [],
  onUpdated,
}: Props) {
  const role = useAuthStore((state) => state.role)
  const [enabled, setEnabled] = useState(Boolean(mirroredEnabled))
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState('')
  const [saving, setSaving] = useState(false)
  const [credentialHardened, setCredentialHardened] = useState(targetType !== 'teacher')
  const [rotatingCredential, setRotatingCredential] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [issuingBookingId, setIssuingBookingId] = useState('')
  const [partnerTeacherStatus, setPartnerTeacherStatus] = useState<Record<string, boolean | 'error'>>({})

  useEffect(() => {
    if (role !== 'admin') return
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setStatusLoading(true)
      setTemporaryPassword('')
      try {
        const result = await getOnlineClassroomPilotStatus(targetType, targetId)
        if (active) {
          setEnabled(result.enabled)
          setCredentialHardened(targetType !== 'teacher' || result.credentialHardened === true)
          setStatusError('')
        }
      } catch (error) {
        if (active) setStatusError(onlineClassroomErrorMessage(error))
      } finally {
        if (active) setStatusLoading(false)
      }
    })
    return () => { active = false }
  }, [role, targetId, targetType])

  const eligibleBookings = useMemo(() => {
    return bookings
    .filter((booking) => (
      booking.status === 'confirmed'
      && !booking.lessonId
      && !booking.groupClassId
      && Boolean(booking.requestedDate)
      && booking.requestedDate! >= RECENT_VIETNAM_DATE
    ))
    .sort((left, right) => `${left.requestedDate || ''} ${left.requestedStart || ''}`.localeCompare(`${right.requestedDate || ''} ${right.requestedStart || ''}`))
    .slice(0, 6)
  }, [bookings])

  const partnerTeacherIds = useMemo(
    () => Array.from(new Set(eligibleBookings.map((booking) => booking.teacherId).filter(Boolean))),
    [eligibleBookings],
  )

  useEffect(() => {
    if (role !== 'admin' || targetType !== 'student' || !enabled || partnerTeacherIds.length === 0) return
    let active = true
    Promise.all(partnerTeacherIds.map(async (teacherId) => {
      try {
        const result = await getOnlineClassroomPilotStatus('teacher', teacherId)
        return [teacherId, result.enabled && result.credentialHardened === true] as const
      } catch {
        return [teacherId, 'error'] as const
      }
    })).then((entries) => {
      if (!active) return
      setPartnerTeacherStatus(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [enabled, partnerTeacherIds, role, targetType])

  if (role !== 'admin') return null

  const toggle = async () => {
    const next = !enabled
    setSaving(true)
    try {
      const result = await setOnlineClassroomPilotAccess(targetType, targetId, next)
      setEnabled(result.enabled)
      onUpdated?.(result.enabled)
      toast.success(result.enabled
        ? `Đã thêm ${targetName} vào nhóm test phòng học trực tuyến.`
        : `Đã thu hồi quyền pilot của ${targetName}.`)
    } catch (error) {
      toast.error(onlineClassroomErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const rotateCredential = async () => {
    if (targetType !== 'teacher') return
    if (credentialHardened && !window.confirm(
      'Đổi mật khẩu sẽ đăng xuất các phiên cũ và tắt pilot. Bạn cần gửi mật khẩu mới cho gia sư rồi bật pilot lại. Tiếp tục?',
    )) return
    setRotatingCredential(true)
    try {
      const result = await rotateOnlineClassroomTeacherPassword(targetId)
      setTemporaryPassword(result.temporaryPassword)
      setCredentialHardened(true)
      setEnabled(false)
      onUpdated?.(false)
      toast.success('Đã tạo mật khẩu pilot riêng và tắt quyền cũ. Hãy sao chép mật khẩu, gửi riêng cho gia sư rồi bật pilot lại.')
    } catch (error) {
      toast.error(onlineClassroomErrorMessage(error))
    } finally {
      setRotatingCredential(false)
    }
  }

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      toast.success('Đã sao chép mật khẩu pilot.')
    } catch {
      toast.error('Không sao chép tự động được. Hãy chọn và sao chép mật khẩu trong ô.')
    }
  }

  const copyInvite = async (booking: BookingRequest) => {
    setIssuingBookingId(booking.id)
    try {
      const joinUrl = await issueOnlineClassroomInvite(booking.id)
      await navigator.clipboard.writeText(joinUrl)
      toast.success('Đã tạo và sao chép magic link học viên. Link chỉ dùng cho đúng buổi học này.')
    } catch (error) {
      toast.error(onlineClassroomErrorMessage(error))
    } finally {
      setIssuingBookingId('')
    }
  }

  return (
    <Card className="border-sky-200 bg-sky-50/60">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
              <Video className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">Pilot phòng học trực tuyến 123English</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Cấp riêng từng gia sư và học viên, mặc định luôn tắt</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
            <p className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />Room name và token nằm ở backend, không lưu trong booking public.</p>
            <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />Vào lớp không tự điểm danh, trừ kim cương hoặc tạo lương.</p>
          </div>
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-800">
            Đây là pilot kỹ thuật quy mô rất nhỏ trên hạ tầng hội nghị công cộng. Không dùng dữ liệu nhạy cảm, không chuyển tiếp magic link và dừng trước giới hạn 25 endpoints mỗi tháng.
          </p>
          {statusError && <p className="mt-3 text-xs font-bold text-rose-700">Không xác minh được allowlist backend: {statusError}</p>}
        </div>

        <div className="flex min-w-48 flex-col items-stretch gap-2">
          <span className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-black ${enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
            {statusLoading ? 'Đang xác minh quyền' : enabled ? 'Đang tham gia pilot' : 'Chưa được cấp quyền'}
          </span>
          <Button
            size="sm"
            variant={enabled ? 'danger' : 'primary'}
            loading={saving}
            disabled={statusLoading || Boolean(statusError) || (targetType === 'teacher' && !credentialHardened)}
            onClick={toggle}
          >
            {enabled ? 'Thu hồi quyền pilot' : 'Bật quyền pilot'}
          </Button>
          {targetType === 'teacher' && (
            <Button
              size="sm"
              variant="outline"
              loading={rotatingCredential}
              disabled={statusLoading || Boolean(statusError) || saving}
              onClick={rotateCredential}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {credentialHardened ? 'Đổi mật khẩu pilot' : 'Tạo mật khẩu pilot'}
            </Button>
          )}
        </div>
      </div>

      {targetType === 'teacher' && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${credentialHardened ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <p className="font-black">
            {credentialHardened
              ? 'Đã bảo vệ bằng mật khẩu pilot riêng.'
              : 'Chưa thể bật pilot: mật khẩu dùng chung không đủ an toàn cho phòng học.'}
          </p>
          <p className="mt-1 font-semibold">
            Mật khẩu mới chỉ hiện một lần cho Admin. Không gửi trong nhóm chung và không lưu vào ghi chú công khai.
          </p>
          {temporaryPassword && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                readOnly
                value={temporaryPassword}
                aria-label="Mật khẩu pilot tạm thời"
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-10 w-full rounded-lg border border-emerald-300 bg-white px-3 font-mono text-sm font-black tracking-wide text-slate-950 outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <Button size="sm" variant="outline" onClick={copyTemporaryPassword}>
                <Copy className="h-3.5 w-3.5" />
                Sao chép
              </Button>
            </div>
          )}
        </div>
      )}

      {targetType === 'student' && enabled && (
        <div className="mt-5 border-t border-sky-200 pt-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-black text-slate-900">Link test theo booking đã xác nhận</h3>
          </div>
          {eligibleBookings.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-sky-200 bg-white/70 px-4 py-5 text-center text-xs font-semibold text-slate-500">
              Chưa có booking 1 kèm 1 đã xác nhận để tạo phòng. Hãy xếp lịch trước, sau đó quay lại đây.
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {eligibleBookings.map((booking) => (
                <div key={booking.id} className="grid gap-3 rounded-xl border border-sky-100 bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{booking.subjectName || 'Lớp học 1 kèm 1'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {booking.requestedDate || 'Chưa có ngày'} lúc {booking.requestedStart || '--:--'} - {booking.requestedEnd || '--:--'}
                    </p>
                    {partnerTeacherStatus[booking.teacherId] !== true && (
                      <p className="mt-1 text-[11px] font-bold text-amber-700">
                        {partnerTeacherStatus[booking.teacherId] === false
                          ? 'Cần bật pilot cho gia sư của booking này trước.'
                          : partnerTeacherStatus[booking.teacherId] === 'error'
                            ? 'Không xác minh được quyền pilot của gia sư.'
                            : 'Đang xác minh quyền pilot của gia sư…'}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={issuingBookingId === booking.id}
                      disabled={partnerTeacherStatus[booking.teacherId] !== true}
                      onClick={() => copyInvite(booking)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Link học viên
                    </Button>
                    {partnerTeacherStatus[booking.teacherId] === true ? (
                      <a
                        href={classroomRoute(booking.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 text-xs font-black text-white transition hover:bg-sky-800 active:scale-[0.98]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Mở với Admin
                      </a>
                    ) : (
                      <span className="inline-flex min-h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-slate-200 px-3 text-xs font-black text-slate-500">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Chưa sẵn sàng
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
