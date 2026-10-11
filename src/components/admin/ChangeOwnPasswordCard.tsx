import { useState, type FormEvent } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Eye, EyeOff, KeyRound } from 'lucide-react'

const MIN_PASSWORD_LENGTH = 6

function changePasswordErrorMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code || ''
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    return 'Mật khẩu hiện tại không đúng'
  }
  if (code === 'auth/too-many-requests') return 'Nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'
  if (code === 'auth/weak-password') return `Mật khẩu mới quá yếu (tối thiểu ${MIN_PASSWORD_LENGTH} ký tự)`
  if (code === 'auth/requires-recent-login' || code === 'auth/user-mismatch' || code === 'auth/user-token-expired') {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất, đăng nhập lại rồi đổi mật khẩu.'
  }
  if (code === 'auth/network-request-failed') return 'Mất kết nối mạng. Vui lòng thử lại.'
  return 'Không đổi được mật khẩu. Vui lòng thử lại.'
}

/**
 * Cho tài khoản đang đăng nhập (admin) tự đổi mật khẩu của chính mình.
 * Chỉ dùng Firebase Auth — không ghi Firestore, không ảnh hưởng dữ liệu khác.
 */
export function ChangeOwnPasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentUser = auth.currentUser
  const email = currentUser?.email || ''

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')

    const user = auth.currentUser
    if (!user || !user.email) {
      setError('Tài khoản này không đăng nhập bằng email nên không đổi mật khẩu tại đây được.')
      return
    }
    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại')
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp')
      return
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại')
      return
    }

    setSaving(true)
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.')
    } catch (err) {
      console.error('Change own password failed:', err)
      setError(changePasswordErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const inputType = showPasswords ? 'text' : 'password'
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPasswords((value) => !value)}
      className="text-slate-400 hover:text-slate-600"
      aria-label={showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
    >
      {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <Card className="animate-slide-up">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
          <KeyRound className="h-5 w-5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Đổi mật khẩu</h2>
          <p className="truncate text-xs text-slate-500">
            Tài khoản: <span className="font-medium text-slate-700">{email || '—'}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        {/* Giúp trình quản lý mật khẩu của trình duyệt gắn đúng tài khoản */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Input
          label="Mật khẩu hiện tại"
          type={inputType}
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          rightElement={toggle}
          disabled={saving}
        />
        <Input
          label="Mật khẩu mới"
          type={inputType}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint={`Tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`}
          disabled={saving}
        />
        <Input
          label="Nhập lại mật khẩu mới"
          type={inputType}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={saving}
        />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" loading={saving} disabled={!email}>
          Đổi mật khẩu
        </Button>
      </form>
    </Card>
  )
}
