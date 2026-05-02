import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { FileText, Search, ExternalLink, CheckCircle } from 'lucide-react'
import { toast } from '@/stores/toastStore'

export function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contracts', id), { status: 'approved' })
      toast.success('Đã duyệt hợp đồng')
    } catch (e: any) {
      toast.error('Lỗi: ' + e.message)
    }
  }

  const filtered = contracts.filter(c => 
    c.teacherName?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Hồ sơ / Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">Duyệt hồ sơ hợp đồng của giáo viên</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 font-medium text-slate-500">Giáo viên</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Ngày gửi</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Trạng thái</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Tài liệu</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {c.teacherName}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {c.createdAt?.toDate().toLocaleString('vi-VN')}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-4">
                      <a 
                        href={c.documentUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg"
                      >
                        <FileText className="w-4 h-4" />
                        Xem văn bản
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      {c.status === 'pending' && (
                        <Button size="sm" variant="primary" onClick={() => handleApprove(c.id)}>
                          <CheckCircle className="w-4 h-4" />
                          Duyệt
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
