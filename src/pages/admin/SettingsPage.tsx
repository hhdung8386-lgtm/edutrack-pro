import { useEffect, useState } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db, secondaryAuth } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { Settings, Building2, Plus, Pencil, Trash2, MapPin, X, Users } from 'lucide-react'

export interface Branch {
  id: string
  name: string
  address: string
  status: 'active' | 'inactive'
  createdAt: any
}

export function SettingsPage() {
  const { role } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'branch' | 'accounts'>('branch')

  // Branch states
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [saving, setSaving] = useState(false)

  // Account management states (only for admin)
  const [accounts, setAccounts] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [deleteAcc, setDeleteAcc] = useState<any | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Account form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [selectedRole, setSelectedRole] = useState<'student_manager' | 'teacher_manager' | 'admin'>('student_manager')

  // Load branches
  useEffect(() => {
    const q = query(collection(db, 'branches'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
        setLoading(false)
      },
      (err) => {
        console.error('Error loading branches:', err)
        toast.error('Không có quyền truy cập danh sách chi nhánh hoặc lỗi kết nối')
        setLoading(false)
      }
    )
  }, [])

  // Load accounts (only if activeTab is accounts and role is admin)
  useEffect(() => {
    if (role !== 'admin' || activeTab !== 'accounts') return
    setLoadingAccounts(true)
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setAccounts(snap.docs.map(d => d.data()))
        setLoadingAccounts(false)
      },
      (err) => {
        console.error('Error loading users:', err)
        toast.error('Lỗi khi tải danh sách tài khoản')
        setLoadingAccounts(false)
      }
    )
  }, [activeTab, role])

  // Branch handlers
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

  // Account handlers
  const handleCreateAccount = async () => {
    if (!email.trim() || !password.trim() || !username.trim()) {
      toast.error('Vui lòng điền đầy đủ các trường thông tin bắt buộc (*)')
      return
    }
    if (password.length < 6) {
      toast.error('Mật khẩu phải dài ít nhất 6 ký tự')
      return
    }
    setSavingAccount(true)
    try {
      // 1. Register with Firebase Auth using secondary Auth instance
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password)
      await secondaryAuth.signOut()

      // 2. Write details into users Firestore collection
      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        email: email.trim().toLowerCase(),
        username: username.trim(),
        role: selectedRole,
        createdAt: serverTimestamp(),
      })

      toast.success('Đã tạo tài khoản nhân viên thành công!')
      setShowAccountModal(false)

      // Reset fields
      setEmail('')
      setPassword('')
      setUsername('')
      setSelectedRole('student_manager')
    } catch (err: any) {
      console.error('Error creating staff account:', err)
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Địa chỉ email này đã được sử dụng cho tài khoản khác')
      } else {
        toast.error(err.message || 'Lỗi khi tạo tài khoản')
      }
    } finally {
      setSavingAccount(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deleteAcc) return
    setDeletingAccount(true)
    try {
      // Deleting user document from users collection
      await deleteDoc(doc(db, 'users', deleteAcc.uid))
      toast.success('Đã xóa tài khoản nhân viên thành công!')
      setDeleteAcc(null)
    } catch (err) {
      console.error(err)
      toast.error('Không thể xóa tài khoản nhân viên')
    } finally {
      setDeletingAccount(false)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý cài đặt hệ thống & nhân sự</p>
      </div>

      {/* Tabs */}
      {role === 'admin' && (
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('branch')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all px-4 ${
              activeTab === 'branch'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Chi nhánh học viện
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all px-4 ${
              activeTab === 'accounts'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Quản lý tài khoản Nhân viên
          </button>
        </div>
      )}

      {/* Branch Management Section */}
      {activeTab === 'branch' && (
        <Card className="animate-slide-up">
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
      )}

      {/* Account Management Section (Only visible for Admin role) */}
      {activeTab === 'accounts' && role === 'admin' && (
        <Card className="animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Quản lý tài khoản nhân viên</h2>
                <p className="text-xs text-slate-500">{accounts.length} tài khoản</p>
              </div>
            </div>
            <Button onClick={() => setShowAccountModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Tạo tài khoản
            </Button>
          </div>

          {loadingAccounts ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm mb-3">Chưa có tài khoản nhân viên nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.uid}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm transition-all duration-200"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    acc.role === 'admin' 
                      ? 'bg-rose-50 text-rose-500' 
                      : acc.role === 'student_manager' 
                      ? 'bg-sky-50 text-sky-500' 
                      : acc.role === 'teacher_manager' 
                      ? 'bg-amber-50 text-amber-500'
                      : 'bg-emerald-50 text-emerald-500'
                  }`}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{acc.username || acc.email}</p>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                        acc.role === 'admin'
                          ? 'bg-rose-100 text-rose-700'
                          : acc.role === 'student_manager'
                          ? 'bg-sky-100 text-sky-700'
                          : acc.role === 'teacher_manager'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {acc.role === 'admin'
                          ? 'Admin'
                          : acc.role === 'student_manager'
                          ? 'Quản lý Học viên'
                          : acc.role === 'teacher_manager'
                          ? 'Quản lý Giáo viên'
                          : acc.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{acc.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {acc.email !== 'admin@edutrackpro.app' && acc.email !== 'admin@123english.edu.vn' && (
                      <button
                        onClick={() => setDeleteAcc(acc)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        aria-label="Xóa tài khoản"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Add/Edit Branch Modal */}
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

      {/* Add Account Modal */}
      {showAccountModal && (
        <Modal
          open
          onClose={() => setShowAccountModal(false)}
          title="Tạo tài khoản nhân viên mới"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowAccountModal(false)}>Hủy</Button>
              <Button onClick={handleCreateAccount} loading={savingAccount}>
                Tạo tài khoản
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="Tên nhân viên / Username *"
              placeholder="VD: Nguyễn Văn A"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="Email đăng nhập *"
              placeholder="VD: manager1@edutrackpro.app"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Mật khẩu *"
              placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500">PHÂN QUYỀN VAI TRÒ *</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
              >
                <option value="student_manager">Quản lý Học viên (Chỉ xem học sinh/buổi dạy, không xem giáo viên/hợp đồng/lương)</option>
                <option value="teacher_manager">Quản lý Giáo viên (Chỉ xem giáo viên/hợp đồng/lương, không xem học sinh)</option>
                <option value="admin">Admin cấp cao (Toàn quyền hệ thống)</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Branch Confirm */}
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

      {/* Delete Account Confirm */}
      {deleteAcc && (
        <ConfirmDialog
          open
          onClose={() => setDeleteAcc(null)}
          onConfirm={handleDeleteAccount}
          title={`Xóa tài khoản nhân viên "${deleteAcc.username || deleteAcc.email}"?`}
          confirmLabel="Xóa"
          loading={deletingAccount}
        >
          <p className="text-sm text-slate-500">
            Hành động này sẽ xóa vĩnh viễn quyền truy cập của tài khoản này khỏi hệ thống.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
