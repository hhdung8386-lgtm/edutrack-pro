import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { StatusBadge } from '@/components/ui/Badge'
import { toast } from '@/stores/toastStore'
import { FileText, Upload, CheckCircle } from 'lucide-react'
import { openBase64InNewTab } from '@/lib/constants'

export function TeacherContractPage() {
  const { teacherId } = useAuthStore()
  const [images, setImages] = useState<string[]>([])
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])

  const requiredText = "Tôi đồng ý với các điều khoản"

  useEffect(() => {
    if (!teacherId) return
    const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
    const unsub = onSnapshot(q, (snap) => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
    })
    return unsub
  }, [teacherId])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    if (images.length + files.length > 5) {
      toast.warning('Tối đa 5 ảnh')
      return
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.warning('Chỉ hỗ trợ file ảnh')
        continue
      }
      
      const canvas = document.createElement('canvas')
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.src = url

      await new Promise((resolve) => { img.onload = resolve })
      
      const MAX = 1200
      let { width, height } = img
      if (width > MAX) { height = (height * MAX) / width; width = MAX }
      if (height > MAX) { width = (width * MAX) / height; height = MAX }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      const preview = canvas.toDataURL('image/jpeg', 0.7)
      setImages((prev) => [...prev, preview])
      URL.revokeObjectURL(url)
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const onSubmit = async () => {
    if (confirmText !== requiredText) {
      toast.error('Vui lòng gõ lại chính xác câu xác nhận bên trên')
      return
    }
    if (images.length === 0) {
      toast.error('Vui lòng tải lên ảnh hợp đồng hoặc biên bản')
      return
    }
    setSubmitting(true)
    try {
      const tSnap = await getDoc(doc(db, 'teachers', teacherId!))
      const teacherName = tSnap.data()?.name || 'Giáo viên'

      await addDoc(collection(db, 'contracts'), {
        teacherId,
        teacherName,
        imageURLs: images,
        status: 'pending',
        createdAt: serverTimestamp()
      })
      toast.success('Gửi hồ sơ thành công!')
      setImages([])
      setConfirmText('')
      // onSnapshot will auto-refresh the list
    } catch (e: any) {
      toast.error('Có lỗi xảy ra: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2 lg:pt-6 pb-20 animate-fade-in">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">Gửi hợp đồng / Hồ sơ</h1>
        <p className="text-sm text-indigo-100 mt-1 relative z-10">Đọc kỹ điều khoản và nộp hợp đồng đã ký của bạn.</p>
      </div>

      <Card className="hover:shadow-xl transition-all duration-300 border-indigo-100/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="font-semibold text-amber-800 mb-2">Yêu cầu bắt buộc:</h3>
            <p className="text-sm text-amber-700/80 mb-3">
              Bạn cần type chính xác đoạn văn bản sau để xác nhận việc gửi hợp đồng:
            </p>
            <div 
              className="bg-white p-3 rounded-lg border border-amber-100 font-mono text-sm text-slate-800 select-none cursor-not-allowed"
              onCopy={(e) => e.preventDefault()}
            >
              {requiredText}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Gõ lại câu xác nhận trên *</label>
            <Textarea 
              placeholder="Tôi xác nhận đã đọc..."
              rows={3}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onPaste={(e) => {
                e.preventDefault()
                toast.warning('Vui lòng tự gõ tay, không được dán (paste)')
              }}
              className={confirmText === requiredText ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50' : ''}
            />
            {confirmText === requiredText && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Xác nhận hợp lệ</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tải lên ảnh đã ký (tối đa 5 ảnh) *</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200">
                  <img src={img} className="w-full h-full object-cover" alt="" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500/80 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="aspect-square border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors hover:bg-slate-50 group">
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-2" />
                  <span className="text-xs text-slate-500 group-hover:text-indigo-600 font-medium">Thêm ảnh</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              )}
            </div>
          </div>

          <Button 
            fullWidth 
            size="lg" 
            onClick={onSubmit} 
            loading={submitting}
            disabled={confirmText !== requiredText || images.length === 0}
            className="mt-4 shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
          >
            <FileText className="w-5 h-5 mr-2" />
            Nộp hồ sơ
          </Button>
        </div>
      </Card>

      {contracts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Hồ sơ đã nộp</h2>
          <div className="space-y-3">
            {contracts.map(c => (
              <Card key={c.id} className="flex items-center justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer border-slate-200/60">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Hợp đồng ngày {c.createdAt ? c.createdAt.toDate().toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {c.imageURLs ? (
                        c.imageURLs.map((url: string, i: number) => (
                          <img 
                            key={i} 
                            src={url} 
                            alt={`Hợp đồng ${i+1}`} 
                            className="w-12 h-12 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); openBase64InNewTab(url); }}
                          />
                        ))
                      ) : (
                        c.documentUrl && (
                          <button onClick={(e) => { e.stopPropagation(); openBase64InNewTab(c.documentUrl); }} className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline font-medium inline-block text-left">
                            Xem văn bản đính kèm
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
