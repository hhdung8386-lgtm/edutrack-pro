import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Subject } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { toast } from '@/stores/toastStore'
import { BookOpen, Plus, Pencil, Search } from 'lucide-react'
import { formatVND } from '@/lib/constants'

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  pricePerMinute: z.coerce.number().min(100, 'Giá tối thiểu 100đ/phút'),
  status: z.enum(['active', 'inactive']),
})
type FormData = z.infer<typeof schema>

function SubjectModal({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const isEdit = !!subject
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: subject ? {
      name: subject.name,
      pricePerMinute: subject.pricePerMinute,
      status: subject.status,
    } : { status: 'active', pricePerMinute: 2500 },
  })

  const price = watch('pricePerMinute') || 0

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && subject) {
        await updateDoc(doc(db, 'subjects', subject.id), { ...data, updatedAt: serverTimestamp() })
        toast.success('Đã cập nhật môn học')
      } else {
        await addDoc(collection(db, 'subjects'), { ...data, createdAt: serverTimestamp() })
        toast.success('Đã thêm môn học')
      }
      onClose()
    } catch {
      toast.error('Có lỗi xảy ra')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa môn học' : 'Thêm môn học'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="subject-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm môn học'}
          </Button>
        </div>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <Input label="Tên môn học *" placeholder="Tiếng Anh" error={errors.name?.message} {...register('name')} />
        <Input
          label="Giá mỗi phút (VND) *"
          type="number"
          step={100}
          placeholder="2500"
          error={errors.pricePerMinute?.message}
          {...register('pricePerMinute')}
        />

        {/* Salary preview */}
        {price > 0 && (
          <div className="bg-white rounded-xl p-4 space-y-1.5 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-2">Ví dụ lương:</p>
            {[{ min: 25, level: 1.0 }, { min: 50, level: 1.2 }, { min: 50, level: 1.5 }].map((ex) => (
              <div key={`${ex.min}-${ex.level}`} className="flex justify-between">
                <span>{ex.min} phút × {price.toLocaleString()}đ × ×{ex.level}</span>
                <span className="text-emerald-400 font-medium">= {(ex.min * price * ex.level).toLocaleString()}đ</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Trạng thái</label>
          <select
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            {...register('status')}
          >
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm dừng</option>
          </select>
        </div>
      </form>
    </Modal>
  )
}

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editSubject, setEditSubject] = useState<Subject | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    return onSnapshot(query(collection(db, 'subjects'), orderBy('createdAt', 'desc')), (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
      setLoading(false)
    })
  }, [])

  const filtered = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Môn học</h1>
          <p className="text-sm text-slate-500 mt-0.5">{subjects.length} môn học</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Thêm môn học
        </Button>
      </div>

      <Input
        placeholder="Tìm môn học..."
        leftIcon={<Search className="w-4 h-4" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 && !loading ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="Chưa có môn học nào"
          action={{ label: 'Thêm môn học', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                {['Tên môn', 'Giá / phút', 'Trạng thái', 'Hành động'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.map((subject) => (
                <tr key={subject.id} className="hover:bg-slate-100/20 transition-colors">
                  <td className="px-5 py-4 font-medium text-slate-700">{subject.name}</td>
                  <td className="px-5 py-4">
                    <span className="text-emerald-400 font-semibold">
                      {subject.pricePerMinute.toLocaleString('vi-VN')}đ
                    </span>
                    <span className="text-slate-500 text-xs"> / phút</span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={subject.status} /></td>
                  <td className="px-5 py-4">
                    <Button size="sm" variant="ghost" onClick={() => setEditSubject(subject)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Sửa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showAdd && <SubjectModal onClose={() => setShowAdd(false)} />}
      {editSubject && <SubjectModal subject={editSubject} onClose={() => setEditSubject(null)} />}
    </div>
  )
}
