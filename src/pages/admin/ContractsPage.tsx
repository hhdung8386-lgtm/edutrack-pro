import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { FileText, Search, CheckCircle, ShieldCheck, Clock, MapPin, Laptop, Eye } from 'lucide-react'
import { toast } from '@/stores/toastStore'
import { openBase64InNewTab } from '@/lib/constants'

export function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setContracts(docs)
      setLoading(false)

      // Fetch teacher names for contracts that don't have teacherName
      const missingIds = docs
        .filter((c: any) => c.teacherId && !c.teacherName)
        .map((c: any) => c.teacherId)
      const uniqueIds = [...new Set(missingIds)]

      const nameMap: Record<string, string> = {}
      for (const tid of uniqueIds) {
        if (teacherNames[tid]) continue
        try {
          const tDoc = await getDoc(doc(db, 'teachers', tid))
          if (tDoc.exists()) {
            nameMap[tid] = tDoc.data().name || 'Không rõ'
          } else {
            nameMap[tid] = 'Không rõ'
          }
        } catch {
          nameMap[tid] = 'Không rõ'
        }
      }
      if (Object.keys(nameMap).length > 0) {
        setTeacherNames(prev => ({ ...prev, ...nameMap }))
      }
    })
    return unsub
  }, [])

  const getTeacherName = (c: any) => {
    return c.teacherName || teacherNames[c.teacherId] || 'Đang tải...'
  }

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contracts', id), { status: 'approved' })
      toast.success('Đã duyệt hợp đồng')
    } catch (e: any) {
      toast.error('Lỗi: ' + e.message)
    }
  }

  const filtered = contracts.filter(c => {
    const name = getTeacherName(c).toLowerCase()
    return name.includes(search.toLowerCase())
  })

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Hồ sơ / Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">Duyệt hồ sơ và xem xác nhận điều khoản của giáo viên</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4 inline mr-1" />
            Đã đồng ý: {contracts.filter(c => c.status === 'agreed' || c.status === 'approved').length}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-amber-700 font-medium">
            Chờ duyệt: {contracts.filter(c => c.status === 'pending').length}
          </div>
        </div>
      </div>

      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên giáo viên..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-10">Không tìm thấy hồ sơ nào</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map(c => {
              const isTerms = c.type === 'terms_of_service'
              const isExpanded = expandedId === c.id

              return (
                <div key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Main row */}
                  <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                    {/* Icon + Teacher Name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isTerms ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                        {isTerms
                          ? <ShieldCheck className="w-5 h-5 text-emerald-600" />
                          : <FileText className="w-5 h-5 text-indigo-600" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{getTeacherName(c)}</p>
                        <p className="text-xs text-slate-500">
                          {isTerms ? 'Xác nhận Điều khoản dịch vụ' : 'Hồ sơ hợp đồng'}
                        </p>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-sm text-slate-500 sm:w-44 shrink-0">
                      <Clock className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                      {c.agreedAt
                        ? c.agreedAt.toDate().toLocaleString('vi-VN')
                        : c.createdAt
                          ? c.createdAt.toDate().toLocaleString('vi-VN')
                          : 'Đang xử lý...'}
                    </div>

                    {/* Status */}
                    <div className="sm:w-28 shrink-0">
                      <StatusBadge status={c.status === 'agreed' ? 'approved' : c.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:w-40 shrink-0 justify-end">
                      {isTerms && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="text-xs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          {isExpanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                        </Button>
                      )}

                      {!isTerms && c.status === 'pending' && (
                        <Button size="sm" variant="primary" onClick={() => handleApprove(c.id)}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Duyệt
                        </Button>
                      )}

                      {/* Legacy: view images */}
                      {!isTerms && c.imageURLs && (
                        <div className="flex gap-1">
                          {c.imageURLs.slice(0, 3).map((url: string, i: number) => (
                            <img
                              key={i}
                              src={url}
                              alt="Hợp đồng"
                              className="w-8 h-8 object-cover rounded border border-slate-200 cursor-pointer hover:opacity-80"
                              onClick={() => openBase64InNewTab(url)}
                            />
                          ))}
                          {c.imageURLs.length > 3 && (
                            <span className="text-xs text-slate-500 self-center">+{c.imageURLs.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail for terms_of_service */}
                  {isTerms && isExpanded && (
                    <div className="px-5 pb-4 animate-fade-in">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 ml-13 space-y-2.5">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Thông tin xác nhận (Bằng chứng điện tử)</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Thời gian xác nhận</p>
                              <p className="text-sm font-medium text-slate-800">
                                {c.agreedAt ? c.agreedAt.toDate().toLocaleString('vi-VN') : 'N/A'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Địa chỉ IP</p>
                              <p className="text-sm font-mono font-medium text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block">
                                {c.ipAddress || 'Không xác định'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Phiên bản điều khoản</p>
                              <p className="text-sm font-medium text-slate-800">{c.termsVersion || 'N/A'}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Teacher ID</p>
                              <p className="text-xs font-mono text-slate-600 break-all">{c.teacherId}</p>
                            </div>
                          </div>
                        </div>

                        {c.userAgent && (
                          <div className="flex items-start gap-2 pt-1 border-t border-slate-200 mt-2">
                            <Laptop className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Thiết bị / Trình duyệt</p>
                              <p className="text-xs text-slate-600 break-all leading-relaxed">{c.userAgent}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
