import { useEffect, useState } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { Settings, Building2, Plus, Pencil, Trash2, MapPin, X } from 'lucide-react'

export interface Branch {
  id: string
  name: string
  address: string
  status: 'active' | 'inactive'
  createdAt: any
}

export function SettingsPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'branches'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
      setLoading(false)
    })
  }, [])

  const openAddModal = () => {
    setEditBranch(null)
    setBranchName('')
    setBranchAddress('')
    setShowModal(true)
  }

  const openEditModal = (branch: Branch) => {
    setEditBranch(branch)
    setBranchName(branch.name)
    setBranchAddress(branch.address)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!branchName.trim()) {
      toast.error('Vui lòng nhập tên chi nhánh')
      return
    }
    setSaving(true)
    try {
      if (editBranch) {
        await updateDoc(doc(db, 'branches', editBranch.id), {
          name: branchName.trim(),
          address: branchAddress.trim(),
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật chi nhánh')
      } else {
        await addDoc(collection(db, 'branches'), {
          name: branchName.trim(),
          address: branchAddress.trim(),
          status: 'active',
          createdAt: serverTimestamp(),
        })
        toast.success('Đã thêm chi nhánh mới')
      }
      setShowModal(false)
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteBranch) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'branches', deleteBranch.id))
      toast.success('Đã xóa chi nhánh')
      setDeleteBranch(null)
    } catch (err) {
      toast.error('Không thể xóa chi nhánh')
    } finally {
      setDeleting(false)
    }
  }

  const toggleStatus = async (branch: Branch) => {
    try {
      const newStatus = branch.status === 'active' ? 'inactive' : 'active'
      await updateDoc(doc(db, 'branches', branch.id), { status: newStatus })
      toast.success(newStatus === 'active' ? 'Đã kích hoạt chi nhánh' : 'Đã tạm dừng chi nhánh')
    } catch {
      toast.error('Có lỗi xảy ra')
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý cài đặt hệ thống</p>
      </div>

      {/* Branch Management Section */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Quản lý chi nhánh</h2>
              <p className="text-xs text-slate-500">{branches.length} chi nhánh</p>
            </div>
          </div>
          <Button onClick={openAddModal} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Thêm
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm mb-3">Chưa có chi nhánh nào</p>
            <Button onClick={openAddModal} variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Thêm chi nhánh đầu tiên
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                  branch.status === 'active'
                    ? 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                    : 'bg-slate-50 border-slate-100 opacity-60'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  branch.status === 'active' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'
                }`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{branch.name}</p>
                  {branch.address && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{branch.address}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleStatus(branch)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                      branch.status === 'active'
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {branch.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                  </button>
                  <button
                    onClick={() => openEditModal(branch)}
                    className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                    aria-label="Sửa chi nhánh"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteBranch(branch)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    aria-label="Xóa chi nhánh"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          open
          onClose={() => setShowModal(false)}
          title={editBranch ? 'Chỉnh sửa chi nhánh' : 'Thêm chi nhánh mới'}
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Hủy</Button>
              <Button onClick={handleSave} loading={saving}>
                {editBranch ? 'Lưu thay đổi' : 'Thêm chi nhánh'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="Tên chi nhánh *"
              placeholder="VD: Chi nhánh Quận 7"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
            <Input
              label="Địa chỉ"
              placeholder="VD: 123 Nguyễn Văn Linh, Q7"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteBranch && (
        <ConfirmDialog
          open
          onClose={() => setDeleteBranch(null)}
          onConfirm={handleDelete}
          title={`Xóa chi nhánh "${deleteBranch.name}"?`}
          confirmLabel="Xóa"
          loading={deleting}
        >
          <p className="text-sm text-slate-500">
            Hành động này không thể hoàn tác. Các học viên thuộc chi nhánh này sẽ không bị ảnh hưởng.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
