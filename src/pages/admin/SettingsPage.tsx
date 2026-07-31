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
import { BookUser, Building2, Check, LockKeyhole, MapPin, Pencil, Plus, Settings, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import {
  DEFAULT_TEACHER_NICKNAMES,
  loadCustomTeacherNicknames,
  saveCustomTeacherNicknames,
  type TeacherNicknameLibrary,
} from '@/lib/nameGenerator'
import { setTeacherAttendanceFeature, useTeacherAttendanceFeature } from '@/hooks/useTeacherAttendanceFeature'

export interface Branch {
  id: string
  name: string
  address: string
  status: 'active' | 'inactive'
  createdAt: any
}

export function SettingsPage() {
  const { role, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'branch' | 'accounts' | 'nicknames' | 'teacher_features'>('branch')
  const { enabled: teacherAttendanceEnabled, loading: loadingTeacherFeatures } = useTeacherAttendanceFeature()
  const [savingTeacherFeatures, setSavingTeacherFeatures] = useState(false)

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

  // Teacher nickname library states
  const [customNicknames, setCustomNicknames] = useState<TeacherNicknameLibrary>({ male: [], female: [] })
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameGender, setNicknameGender] = useState<'female' | 'male'>('female')
  const [loadingNicknames, setLoadingNicknames] = useState(false)
  const [savingNicknames, setSavingNicknames] = useState(false)

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

  useEffect(() => {
    if (role !== 'admin' || activeTab !== 'nicknames') return
    setLoadingNicknames(true)
    loadCustomTeacherNicknames()
      .then(setCustomNicknames)
      .finally(() => setLoadingNicknames(false))
  }, [activeTab, role])

  const saveNicknameChanges = async (next: TeacherNicknameLibrary, successMessage: string) => {
    setSavingNicknames(true)
    try {
      await saveCustomTeacherNicknames(next)
      setCustomNicknames(next)
      toast.success(successMessage)
    } catch (error) {
      console.error(error)
      toast.error('Không thể lưu thư viện tên giáo viên')
    } finally {
      setSavingNicknames(false)
    }
  }

  const addNicknames = async () => {
    const names = nicknameInput
      .split(/[\n,;]+/)
      .map(name => name.trim().replace(/\s+/g, ''))
      .filter(name => /^[A-Za-z][A-Za-z0-9]{1,19}$/.test(name))
      .map(name => name.charAt(0).toUpperCase() + name.slice(1))
    if (!names.length) {
      toast.error('Nhập ít nhất một tên tiếng Anh hợp lệ')
      return
    }
    const existing = new Set([
      ...DEFAULT_TEACHER_NICKNAMES[nicknameGender],
      ...customNicknames[nicknameGender],
    ].map(name => name.toLowerCase()))
    const added = names.filter(name => !existing.has(name.toLowerCase()))
    if (!added.length) {
      toast.error('Các tên vừa nhập đã có trong thư viện')
      return
    }
    const next = {
      ...customNicknames,
      [nicknameGender]: [...customNicknames[nicknameGender], ...added],
    }
    await saveNicknameChanges(next, `Đã thêm ${added.length} tên vào thư viện`)
    setNicknameInput('')
  }

  const removeCustomNickname = async (gender: 'female' | 'male', nickname: string) => {
    const next = {
      ...customNicknames,
      [gender]: customNicknames[gender].filter(name => name !== nickname),
    }
    await saveNicknameChanges(next, `Đã xóa tên ${nickname}`)
  }

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

  const toggleTeacherAttendance = async () => {
    if (savingTeacherFeatures || loadingTeacherFeatures) return
    const nextEnabled = !teacherAttendanceEnabled
    setSavingTeacherFeatures(true)
    try {
      await setTeacherAttendanceFeature(nextEnabled, user?.email || user?.uid)
      toast.success(nextEnabled
        ? 'Đã mở lại chức năng điểm danh cho gia sư'
        : 'Đã khóa chức năng điểm danh của gia sư')
    } catch (error) {
      console.error('Unable to update teacher attendance setting:', error)
      toast.error('Không thể cập nhật chức năng điểm danh')
    } finally {
      setSavingTeacherFeatures(false)
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
        <div className="flex flex-wrap gap-2 border-b border-slate-200">
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
          <button
            onClick={() => setActiveTab('nicknames')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all px-4 ${
              activeTab === 'nicknames'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Thư viện tên giáo viên
          </button>
          <button
            onClick={() => setActiveTab('teacher_features')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all px-4 ${
              activeTab === 'teacher_features'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Chức năng gia sư
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

      {activeTab === 'nicknames' && role === 'admin' && (
        <Card className="animate-slide-up overflow-hidden">
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <BookUser className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Thư viện tên giao tiếp</h2>
                <p className="mt-0.5 text-xs text-slate-500">Tên được ưu tiên khi hệ thống tạo tài khoản giáo viên mới.</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">{DEFAULT_TEACHER_NICKNAMES.female.length + customNicknames.female.length} tên nữ</span>
              <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-700">{DEFAULT_TEACHER_NICKNAMES.male.length + customNicknames.male.length} tên nam</span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-[10rem_1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Nhóm tên</span>
                <select
                  value={nicknameGender}
                  onChange={event => setNicknameGender(event.target.value as 'female' | 'male')}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="female">Giáo viên nữ</option>
                  <option value="male">Giáo viên nam</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Tên muốn bổ sung</span>
                <input
                  value={nicknameInput}
                  onChange={event => setNicknameInput(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && (event.preventDefault(), addNicknames())}
                  placeholder="Ví dụ: Annie, Belle, Sean"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </label>
              <Button onClick={addNicknames} loading={savingNicknames} className="h-11 bg-amber-400 text-slate-900 hover:bg-amber-500">
                <Plus className="mr-1 h-4 w-4" /> Thêm vào thư viện
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Có thể nhập nhiều tên, ngăn cách bằng dấu phẩy. Hệ thống tự loại tên trùng và chỉ nhận ký tự tiếng Anh.</p>
          </div>

          {loadingNicknames ? (
            <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" /></div>
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {(['female', 'male'] as const).map(group => (
                <section key={group} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{group === 'female' ? 'Tên giáo viên nữ' : 'Tên giáo viên nam'}</h3>
                    <span className="text-xs font-semibold text-slate-400">{DEFAULT_TEACHER_NICKNAMES[group].length} mặc định</span>
                  </div>
                  <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
                    {DEFAULT_TEACHER_NICKNAMES[group].map(name => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                        <Check className="h-3 w-3 text-emerald-500" /> {name}
                      </span>
                    ))}
                    {customNicknames[group].map(name => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                        {name}
                        <button
                          type="button"
                          onClick={() => removeCustomNickname(group, name)}
                          disabled={savingNicknames}
                          className="rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-rose-600 disabled:opacity-50"
                          aria-label={`Xóa tên ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {customNicknames[group].length > 0 && (
                    <p className="mt-3 text-xs font-semibold text-amber-700">{customNicknames[group].length} tên do admin bổ sung</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'teacher_features' && role === 'admin' && (
        <Card className="animate-slide-up overflow-hidden">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                teacherAttendanceEnabled
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-amber-200'
              }`}>
                {teacherAttendanceEnabled
                  ? <ShieldCheck className="h-6 w-6" />
                  : <LockKeyhole className="h-6 w-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Quyền thao tác gia sư</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">Điểm danh buổi học</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Khóa hoặc mở đồng bộ trang Điểm danh và thao tác điểm danh trong Lịch dạy. Lịch sử, lịch đã đặt và dữ liệu buổi học cũ luôn được giữ nguyên.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={teacherAttendanceEnabled}
              aria-label="Bật hoặc tắt chức năng điểm danh của gia sư"
              disabled={loadingTeacherFeatures || savingTeacherFeatures}
              onClick={toggleTeacherAttendance}
              className={`relative inline-flex h-12 w-full shrink-0 items-center rounded-2xl px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-wait disabled:opacity-60 sm:w-48 ${
                teacherAttendanceEnabled ? 'bg-emerald-600' : 'bg-slate-800'
              }`}
            >
              <span className={`absolute h-8 w-8 rounded-xl bg-white shadow-sm transition-all ${
                teacherAttendanceEnabled ? 'right-2' : 'left-2'
              }`} />
              <span className={`relative z-10 w-full text-center text-sm font-black text-white ${
                teacherAttendanceEnabled ? 'pr-9' : 'pl-9'
              }`}>
                {loadingTeacherFeatures
                  ? 'Đang tải...'
                  : savingTeacherFeatures
                    ? 'Đang lưu...'
                    : teacherAttendanceEnabled ? 'Đang mở' : 'Đang khóa'}
              </span>
            </button>
          </div>

          <div className={`mt-6 rounded-2xl border px-4 py-4 ${
            teacherAttendanceEnabled
              ? 'border-emerald-200 bg-emerald-50/70'
              : 'border-amber-200 bg-amber-50/70'
          }`}>
            <p className={`text-sm font-bold ${teacherAttendanceEnabled ? 'text-emerald-900' : 'text-amber-950'}`}>
              {teacherAttendanceEnabled
                ? 'Gia sư có thể tìm học viên và gửi điểm danh sau buổi học.'
                : 'Gia sư chỉ có thể xem lịch dạy và lịch sử; mọi nút gửi điểm danh đều bị khóa.'}
            </p>
            <p className={`mt-1 text-xs leading-5 ${teacherAttendanceEnabled ? 'text-emerald-700' : 'text-amber-800'}`}>
              Thay đổi được cập nhật theo thời gian thực, không cần xóa trang hoặc tải lại dữ liệu.
            </p>
          </div>
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
