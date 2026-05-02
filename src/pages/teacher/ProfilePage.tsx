import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { toast } from '@/stores/toastStore'
import { Copy, CalendarDays, Wallet, HeadphonesIcon, GraduationCap } from 'lucide-react'

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
  if (!teacher) return <p className="text-slate-500 text-center py-20">Không tìm thấy hồ sơ</p>

  const monthSalary = lessons.reduce((sum, l) => sum + (l.salary || 0), 0)
  const trackingUrl = `${window.location.origin}/tracking?teacher=${teacher.code}`

  const copyLink = () => {
    navigator.clipboard.writeText(trackingUrl)
    toast.success('Đã sao chép link hồ sơ')
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-8">
      {/* Header section with gradient cover */}
      <div className="relative pt-6">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 rounded-b-3xl shadow-lg" />
        
        <div className="relative px-4 pt-12">
          <Card className="shadow-xl shadow-indigo-100/50 border-0">
            <div className="flex flex-col items-center text-center">
              <div className="relative -mt-16 mb-4">
                {teacher.photoURL ? (
                  <img src={teacher.photoURL} alt={teacher.name} className="w-24 h-24 rounded-2xl object-cover shadow-lg border-4 border-white" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-indigo-100 border-4 border-white shadow-lg flex items-center justify-center text-3xl font-bold text-indigo-500">
                    {teacher.name[0]}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-white shadow-sm">
                  Cấp {teacher.level}
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900">{teacher.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 justify-center">
                <span className="font-mono text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">{teacher.code}</span>
              </div>

              {(teacher.subjectNames?.length ?? 0) > 0 && (
                <div className="flex gap-2 flex-wrap justify-center mt-4">
                  {(teacher.subjectNames ?? []).map((s) => (
                    <div key={s} className="flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full">
                      <GraduationCap className="w-3.5 h-3.5" />
                      {s}
                    </div>
                  ))}
                </div>
              )}

              {teacher.bio && (
                <p className="mt-5 text-sm text-slate-600 leading-relaxed max-w-sm mx-auto italic">"{teacher.bio}"</p>
              )}

              <Button variant="outline" className="mt-6 w-full sm:w-auto rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700" onClick={copyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Sao chép link hồ sơ
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Stats */}
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider ml-1 mt-2">Thống kê tháng này</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="flex flex-col items-center justify-center py-6 border-0 shadow-md shadow-slate-200/50 hover:scale-[1.02] transition-transform">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3">
              <CalendarDays className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{lessons.length}</p>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Buổi đã dạy</p>
          </Card>
          
          <Card className="flex flex-col items-center justify-center py-6 border-0 shadow-md shadow-slate-200/50 hover:scale-[1.02] transition-transform bg-gradient-to-b from-white to-emerald-50/30">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{formatVND(monthSalary)}</p>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">Thu nhập</p>
          </Card>
        </div>

        {/* Contact admin */}
        <div className="mt-8 bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <HeadphonesIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-indigo-900">Cần hỗ trợ từ Admin?</p>
            <p className="text-sm text-indigo-700/80 mt-1 leading-relaxed">
              Mọi thay đổi về thông tin cá nhân vui lòng liên hệ Admin qua Zalo hoặc Hotline để được cập nhật.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
