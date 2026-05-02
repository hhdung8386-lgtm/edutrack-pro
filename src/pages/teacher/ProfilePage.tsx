import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { toast } from '@/stores/toastStore'
import { Copy, User } from 'lucide-react'

export function ProfilePage() {
  const { teacherId } = useAuthStore()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teacherId) return
    getDoc(doc(db, 'teachers', teacherId)).then((snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      setLoading(false)
    })

    const month = getCurrentMonth()
    const q = query(
      collection(db, 'lessons'),
      where('teacherId', '==', teacherId),
      where('status', '==', 'approved'),
      where('date', '>=', `${month}-01`)
    )
    return onSnapshot(q, (snap) => {
      setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)))
    })
  }, [teacherId])

  if (loading) return <LoadingSpinner />
  if (!teacher) return <p className="text-slate-400 text-center py-20">Không tìm thấy hồ sơ</p>

  const monthSalary = lessons.reduce((sum, l) => sum + (l.salary || 0), 0)
  const trackingUrl = `${window.location.origin}/tracking?teacher=${teacher.code}`

  const copyLink = () => {
    navigator.clipboard.writeText(trackingUrl)
    toast.success('Đã sao chép link hồ sơ')
  }

  return (
    <div className="max-w-xl mx-auto space-y-5 pt-2 lg:pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Hồ sơ giáo viên</h1>

      {/* Profile card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {teacher.photoURL ? (
              <img src={teacher.photoURL} alt={teacher.name} className="w-20 h-20 rounded-xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-400">
                {teacher.name[0]}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-100">{teacher.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-sm text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{teacher.code}</span>
              <Badge variant="info">Cấp ×{teacher.level}</Badge>
            </div>
            {(teacher.subjectNames?.length ?? 0) > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {(teacher.subjectNames ?? []).map((s) => (
                  <Badge key={s} variant="slate">{s}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {teacher.bio && (
          <p className="mt-4 text-sm text-slate-400 leading-relaxed">{teacher.bio}</p>
        )}

        <Button variant="outline" fullWidth className="mt-4" onClick={copyLink}>
          <Copy className="w-4 h-4" />
          Chia sẻ hồ sơ
        </Button>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center">
          <p className="text-3xl font-bold text-slate-100">{lessons.length}</p>
          <p className="text-xs text-slate-400 mt-1">Buổi dạy tháng này</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold text-emerald-400">{formatVND(monthSalary)}</p>
          <p className="text-xs text-slate-400 mt-1">Lương tháng này</p>
        </Card>
      </div>

      {/* Contact admin */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <p className="text-sm font-medium text-slate-300 mb-2">Cần hỗ trợ?</p>
        <p className="text-sm text-slate-400">
          Liên hệ Admin qua Zalo hoặc điện thoại để được hỗ trợ kịp thời.
        </p>
        <p className="text-xs text-slate-500 mt-2">Lưu ý: Thông tin cá nhân chỉ admin mới có thể chỉnh sửa.</p>
      </Card>
    </div>
  )
}
