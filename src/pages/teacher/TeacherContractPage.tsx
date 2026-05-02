import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
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
  const [fileUrl, setFileUrl] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [contracts, setContracts] = useState<any[]>([])

  const requiredText = "Tôi đồng ý với các điều khoản"

  useEffect(() => {
    if (!teacherId) return
    const fetchContracts = async () => {
      const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
      const snap = await getDocs(q)
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
    }
    fetchContracts()
  }, [teacherId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadProgress(10)
    // Simulating file upload, convert to base64 for simplicity as in AttendancePage
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      if (file.type.startsWith('image/')) {
        const img = new Image()
        img.src = e.target?.result as string
        img.onload = () => {
          setUploadProgress(50)
          const canvas = document.createElement('canvas')
          let { width, height } = img
          const MAX = 1200
          if (width > MAX) { height = (height * MAX) / width; width = MAX }
          if (height > MAX) { width = (width * MAX) / height; height = MAX }
          canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          setFileUrl(canvas.toDataURL('image/jpeg', 0.8))
          setUploadProgress(100)
        }
      } else {
        // Just store base64 for PDF or other (not recommended for large files but fits the current constraint)
        setFileUrl(e.target?.result as string)
        setUploadProgress(100)
      }
    }
  }

  const onSubmit = async () => {
    if (confirmText !== requiredText) {
      toast.error('Vui lòng gõ lại chính xác câu xác nhận bên trên')
      return
    }
    if (!fileUrl) {
      toast.error('Vui lòng tải lên file hợp đồng hoặc biên bản')
      return
    }
    setSubmitting(true)
    try {
      const tSnap = await getDoc(doc(db, 'teachers', teacherId!))
      const teacherName = tSnap.data()?.name || 'Giáo viên'

      await addDoc(collection(db, 'contracts'), {
        teacherId,
        teacherName,
        documentUrl: fileUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      })
      toast.success('Gửi hồ sơ thành công!')
      setFileUrl('')
      setConfirmText('')
      setUploadProgress(0)
      // Refresh list
      const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
      const snap = await getDocs(q)
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Tải lên văn bản đã ký *</label>
            <div className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${fileUrl ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300 hover:border-indigo-500'}`}>
              <input type="file" accept="image/*,application/pdf" title="Tải lên văn bản đã ký" aria-label="Tải lên văn bản đã ký" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
              {fileUrl ? (
                <>
                  <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-medium text-emerald-700">Đã tải lên văn bản</p>
                  <p className="text-xs text-slate-500 mt-1">Nhấn để thay đổi</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-indigo-400 mb-2 group-hover:scale-110 transition-transform duration-300" />
                  <p className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Nhấn để chọn file</p>
                  <p className="text-xs text-slate-500 mt-1">Hỗ trợ ảnh hoặc PDF (tối đa 5MB)</p>
                </>
              )}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                  <div className={`h-full bg-indigo-500 transition-all ${uploadProgress === 10 ? 'w-[10%]' : uploadProgress === 50 ? 'w-[50%]' : uploadProgress === 100 ? 'w-full' : 'w-0'}`} />
                </div>
              )}
            </div>
          </div>

          <Button 
            fullWidth 
            size="lg" 
            onClick={onSubmit} 
            loading={submitting}
            disabled={confirmText !== requiredText || !fileUrl}
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
                    <p className="text-sm font-bold text-slate-800">Hợp đồng ngày {c.createdAt?.toDate().toLocaleDateString('vi-VN')}</p>
                    <button onClick={() => openBase64InNewTab(c.documentUrl)} className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline font-medium mt-0.5 inline-block text-left">Xem văn bản đính kèm</button>
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
