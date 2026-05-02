import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      const { role } = await signIn(data.email, data.password)
      if (role === 'admin') navigate('/admin/dashboard')
      else if (role === 'teacher') navigate('/teacher/attendance')
      else setError('Tài khoản không có quyền truy cập')
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Email hoặc mật khẩu không đúng')
      } else if (msg.includes('too-many-requests')) {
        setError('Quá nhiều lần thử. Vui lòng thử lại sau.')
      } else if (msg.includes('không có quyền')) {
        setError(msg)
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-transparent to-slate-900" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-modal">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">EduTrack Pro</h1>
            <p className="text-sm text-slate-400 mt-1">Hệ thống quản lý lớp học 1 kèm 1</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="admin@edutrackpro.app"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              error={errors.password?.message}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              {...register('password')}
            />

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={isSubmitting}
              className="mt-2"
            >
              Đăng nhập
            </Button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-6">
            Liên hệ quản trị viên để được cấp tài khoản
          </p>
        </div>
      </div>
    </div>
  )
}
