import { useEffect, useState } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc,
  getDocFromServer, onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db, secondaryAuth } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, type UserCredential } from 'firebase/auth'
import { BookUser, Building2, Check, MapPin, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import {
  DEFAULT_TEACHER_NICKNAMES,
  loadCustomTeacherNicknames,
  saveCustomTeacherNicknames,
  type TeacherNicknameLibrary,
} from '@/lib/nameGenerator'
import { getCurrentMonth } from '@/lib/constants'

export interface Branch {
  id: string
  name: string
  address: string
  status: 'active' | 'inactive'
  createdAt: any
}

type StaffAccountKind = 'student_manager' | 'teacher_manager' | 'booking_assistant' | 'admin'

function normalizeStaffEmail(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized.includes('@') ? normalized : `${normalized}@edutrackpro.app`
}

function isValidStaffEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function SettingsPage() {
  const { role, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'branch' | 'accounts' | 'nicknames' | 'payroll_tax'>('branch')
  const [payrollTaxLoading, setPayrollTaxLoading] = useState(true)
  const [payrollTaxSaving, setPayrollTaxSaving] = useState(false)
  const [payrollTaxEnabled, setPayrollTaxEnabled] = useState(false)
  const [payrollTaxThreshold, setPayrollTaxThreshold] = useState('5000000')
  const [payrollTaxRate, setPayrollTaxRate] = useState('10')
  const [payrollTaxCurrency, setPayrollTaxCurrency] = useState('VND')
  const [payrollTaxEffectiveFromMonth, setPayrollTaxEffectiveFromMonth] = useState(getCurrentMonth())

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
  const [selectedRole, setSelectedRole] = useState<StaffAccountKind>('student_manager')

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

  useEffect(() => {
    if (role !== 'admin' || activeTab !== 'payroll_tax') return
    setPayrollTaxLoading(true)
    return onSnapshot(
      doc(db, 'paymentSettings', 'main'),
      (snapshot) => {
        const data = snapshot.data() || {}
        setPayrollTaxEnabled(data.payrollTaxEnabled === true)
        setPayrollTaxThreshold(String(data.payrollTaxThresholdAmount ?? 5000000))
        setPayrollTaxRate(String(data.payrollTaxRatePercent ?? 10))
        setPayrollTaxCurrency(String(data.payrollTaxCurrency || 'VND'))
        setPayrollTaxEffectiveFromMonth(String(data.payrollTaxEffectiveFromMonth || getCurrentMonth()))
        setPayrollTaxLoading(false)
      },
      (error) => {
        console.error('Unable to load payroll tax settings:', error)
        setPayrollTaxLoading(false)
        toast.error('Không tải được cấu hình thuế TNCN')
      },
    )
  }, [activeTab, role])

  const saveNicknameChanges = async (next: TeacherNicknameLibrary, successMessage: string) => {
    setSavingNicknames(true)
    try {
      await saveCustomTeacherNicknames(next)
      setCustomNicknames(next)
      toast.success(successMessage)
    } catch (error) {
      console.error(error)
      toast.error('Không thể lưu thư viện tên gia sư')
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
    const normalizedEmail = normalizeStaffEmail(email)
    if (!isValidStaffEmail(normalizedEmail)) {
      toast.error('Tên đăng nhập hoặc email không hợp lệ. Chỉ nhập tên ngắn không dấu, hoặc nhập đầy đủ email.')
      return
    }
    if (password.length < 6) {
      toast.error('Mật khẩu phải dài ít nhất 6 ký tự')
      return
    }

    const storedRole = selectedRole === 'booking_assistant' ? 'student_manager' : selectedRole
    const accessScope = selectedRole === 'booking_assistant' ? 'booking_only' : null
    const profileData = (uid: string) => ({
      uid,
      email: normalizedEmail,
      username: username.trim(),
      role: storedRole,
      ...(accessScope ? { accessScope } : {}),
      createdAt: serverTimestamp(),
    })

    setSavingAccount(true)
    let createdAuthUser = false
    try {
      let credential: UserCredential
      try {
        credential = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, password)
        createdAuthUser = true
      } catch (authError: unknown) {
        const authErrorCode = typeof authError === 'object' && authError !== null && 'code' in authError
          ? String(authError.code)
          : ''
        if (authErrorCode !== 'auth/email-already-in-use') throw authError

        // Tài khoản Auth có thể đã được tạo ở lần trước nhưng users/{uid} chưa ghi
        // thành công. Chỉ khôi phục khi Admin nhập lại đúng mật khẩu, không dò UID
        // và không ghi đè một hồ sơ quyền đã tồn tại.
        credential = await signInWithEmailAndPassword(secondaryAuth, normalizedEmail, password)
        const existingProfile = await getDocFromServer(doc(db, 'users', credential.user.uid))
        if (existingProfile.exists()) {
          const profileExistsError = new Error('ACCOUNT_PROFILE_EXISTS') as Error & { cause?: unknown }
          profileExistsError.cause = authError
          throw profileExistsError
        }
      }

      await setDoc(doc(db, 'users', credential.user.uid), profileData(credential.user.uid))

      toast.success(createdAuthUser
        ? 'Đã tạo tài khoản nhân viên thành công!'
        : 'Đã khôi phục hồ sơ quyền và tài khoản có thể đăng nhập!')
      setShowAccountModal(false)

      // Reset fields
      setEmail('')
      setPassword('')
      setUsername('')
      setSelectedRole('student_manager')
    } catch (err: unknown) {
      console.error('Error creating staff account:', err)
      const errorMessage = err instanceof Error ? err.message : ''
      const errorCode = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
      if (errorMessage === 'ACCOUNT_PROFILE_EXISTS') {
        toast.error('Email này đã có tài khoản và hồ sơ quyền. Hệ thống không ghi đè để tránh đổi nhầm phân quyền.')
      } else if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        toast.error('Email đã tồn tại nhưng mật khẩu không khớp, nên không thể tự khôi phục hồ sơ quyền.')
      } else if (errorCode === 'auth/invalid-email') {
        toast.error('Tên đăng nhập hoặc email không hợp lệ.')
      } else if (createdAuthUser) {
        toast.error('Đã tạo thông tin đăng nhập nhưng chưa lưu được hồ sơ quyền. Giữ nguyên email/mật khẩu và bấm Tạo tài khoản lại để hệ thống tự khôi phục, không tạo trùng dữ liệu.')
      } else {
        toast.error('Không thể tạo tài khoản lúc này. Vui lòng kiểm tra kết nối và thử lại.')
      }
    } finally {
      await secondaryAuth.signOut().catch(() => undefined)
      setSavingAccount(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deleteAcc) return
    setDeletingAccount(true)
    try {
      // Deleting user document from users collection
      await deleteDoc(doc(db, 'users', deleteAcc.uid))
      toast.success('Đã thu hồi quyền truy cập của tài khoản nhân viên!')
      setDeleteAcc(null)
    } catch (err) {
      console.error(err)
      toast.error('Không thể thu hồi quyền truy cập của tài khoản nhân viên')
    } finally {
      setDeletingAccount(false)
    }
  }

  const savePayrollTaxSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const threshold = Number(payrollTaxThreshold.replace(/[^\d]/g, ''))
    const rate = Number(payrollTaxRate)
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.warning('Vui lòng nhập ngưỡng thu nhập hợp lệ')
      return
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.warning('Tỷ lệ thuế phải nằm trong khoảng 0 đến 100%')
      return
    }
    if (!/^\d{4}-\d{2}$/.test(payrollTaxEffectiveFromMonth)) {
      toast.warning('Vui lòng chọn tháng áp dụng hợp lệ')
      return
    }
    setPayrollTaxSaving(true)
    try {
      await setDoc(doc(db, 'paymentSettings', 'main'), {
        payrollTaxEnabled,
        payrollTaxThresholdAmount: Math.round(threshold),
        payrollTaxRatePercent: rate,
        payrollTaxCurrency: payrollTaxCurrency.toUpperCase(),
        payrollTaxEffectiveFromMonth,
        payrollTaxUpdatedAt: serverTimestamp(),
        payrollTaxUpdatedBy: user?.email || user?.uid || '',
      }, { merge: true })
      toast.success('Đã lưu cấu hình thuế TNCN')
    } catch (error) {
      console.error('Unable to save payroll tax settings:', error)
      toast.error('Không lưu được cấu hình thuế TNCN')
    } finally {
      setPayrollTaxSaving(false)
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
            Thư viện tên gia sư
          </button>
          <button
            onClick={() => setActiveTab('payroll_tax')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all px-4 ${
              activeTab === 'payroll_tax'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Thuế TNCN / Lương
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
                    acc.accessScope === 'booking_only'
                      ? 'bg-emerald-50 text-emerald-600'
                      : acc.role === 'admin'
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
                        acc.accessScope === 'booking_only'
                          ? 'bg-emerald-100 text-emerald-800'
                          : acc.role === 'admin'
                          ? 'bg-rose-100 text-rose-700'
                          : acc.role === 'student_manager'
                          ? 'bg-sky-100 text-sky-700'
                          : acc.role === 'teacher_manager'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {acc.accessScope === 'booking_only'
                          ? 'Trợ lý xếp lớp'
                          : acc.role === 'admin'
                          ? 'Admin'
                          : acc.role === 'student_manager'
                          ? 'Quản lý Học viên'
                          : acc.role === 'teacher_manager'
                          ? 'Quản lý Gia sư'
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
                <p className="mt-0.5 text-xs text-slate-500">Tên được ưu tiên khi hệ thống tạo tài khoản gia sư mới.</p>
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
                  <option value="female">Gia sư nữ</option>
                  <option value="male">Gia sư nam</option>
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
                    <h3 className="font-bold text-slate-900">{group === 'female' ? 'Tên gia sư nữ' : 'Tên gia sư nam'}</h3>
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

      {activeTab === 'payroll_tax' && role === 'admin' && (
        <Card className="animate-slide-up overflow-hidden">
          <div className="mb-6 border-b border-slate-100 pb-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Cấu hình lương</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Khấu trừ thuế TNCN</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Có thể bật/tắt và thay đổi ngưỡng áp dụng mà không cần sửa code. Mặc định hiện tại đang tắt để không tự động trừ 10%.
            </p>
          </div>
          {payrollTaxLoading ? (
            <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>
          ) : (
            <form onSubmit={savePayrollTaxSettings} className="space-y-5">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={payrollTaxEnabled}
                  onChange={(event) => setPayrollTaxEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-black text-slate-800">Bật khấu trừ thuế TNCN</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Khi tắt, Gross và Net sẽ bằng nhau trên bảng lương.</span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Ngưỡng thu nhập"
                  value={payrollTaxThreshold}
                  onChange={(event) => setPayrollTaxThreshold(event.target.value)}
                  inputMode="numeric"
                  hint="Chỉ khấu trừ khi tổng Gross lớn hơn ngưỡng này."
                />
                <Input
                  label="Tỷ lệ thuế (%)"
                  value={payrollTaxRate}
                  onChange={(event) => setPayrollTaxRate(event.target.value)}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">Loại tiền</span>
                  <select value={payrollTaxCurrency} onChange={(event) => setPayrollTaxCurrency(event.target.value)} className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="VND">VND</option>
                    <option value="PHP">PHP</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">Tháng bắt đầu áp dụng</span>
                  <input type="month" value={payrollTaxEffectiveFromMonth} onChange={(event) => setPayrollTaxEffectiveFromMonth(event.target.value)} className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </label>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={payrollTaxSaving}>Lưu cấu hình thuế</Button>
              </div>
            </form>
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
              label="Email hoặc tên đăng nhập *"
              placeholder="VD: quynhnhu hoặc quynhnhu@edutrackpro.app"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              hint="Nếu chỉ nhập tên ngắn, hệ thống tự thêm @edutrackpro.app."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Mật khẩu *"
              placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreateAccount()
                }
              }}
            />
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500">PHÂN QUYỀN VAI TRÒ *</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as StaffAccountKind)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
              >
                <option value="booking_assistant">Trợ lý xếp lớp (Chỉ thấy trang Lịch xếp lớp)</option>
                <option value="student_manager">Quản lý Học viên (Chỉ xem học sinh/buổi dạy, không xem gia sư/hợp đồng/lương)</option>
                <option value="teacher_manager">Quản lý Gia sư (Chỉ xem gia sư/hợp đồng/lương, không xem học sinh)</option>
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
          title={`Thu hồi quyền của tài khoản "${deleteAcc.username || deleteAcc.email}"?`}
          confirmLabel="Thu hồi quyền"
          loading={deletingAccount}
        >
          <p className="text-sm text-slate-500">
            Hệ thống chỉ xóa hồ sơ phân quyền, không xóa dữ liệu lớp học. Có thể tạo lại bằng đúng email và mật khẩu để khôi phục quyền sau này.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
