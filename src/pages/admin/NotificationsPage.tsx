import { useEffect, useState } from 'react'
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  serverTimestamp, query, orderBy, getDocs, where
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { SystemNotification, Teacher, Student } from '@/types'
import {
  Bell, Calendar, ClipboardList, ShieldAlert, Clock, MessageSquare,
  Plus, Trash2, Users, Search, Check, Send, AlertTriangle, UserCheck
} from 'lucide-react'

const COLORS = [
  { key: 'indigo', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', fill: 'bg-indigo-600', text: 'text-indigo-600' },
  { key: 'emerald', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', fill: 'bg-emerald-600', text: 'text-emerald-600' },
  { key: 'amber', bg: 'bg-amber-50 border-amber-200 text-amber-700', fill: 'bg-amber-600', text: 'text-amber-600' },
  { key: 'rose', bg: 'bg-rose-50 border-rose-200 text-rose-700', fill: 'bg-rose-600', text: 'text-rose-600' },
  { key: 'sky', bg: 'bg-sky-50 border-sky-200 text-sky-700', fill: 'bg-sky-600', text: 'text-sky-600' },
] as const

const ICONS = [
  { key: 'Bell', icon: Bell },
  { key: 'Calendar', icon: Calendar },
  { key: 'ClipboardList', icon: ClipboardList },
  { key: 'ShieldAlert', icon: ShieldAlert },
  { key: 'Clock', icon: Clock },
  { key: 'MessageSquare', icon: MessageSquare },
] as const

export function NotificationsPage() {
  const { user } = useAuthStore()
  
  // Sent notifications list
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deleteNotify, setDeleteNotify] = useState<SystemNotification | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form States
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedColor, setSelectedColor] = useState<typeof COLORS[number]['key']>('indigo')
  const [selectedIcon, setSelectedIcon] = useState<typeof ICONS[number]['key']>('Bell')
  const [targetType, setTargetType] = useState<SystemNotification['targetType']>('teachers')
  const [scope, setScope] = useState<'all' | 'specific'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  // Specific targets search data
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [targetSearch, setTargetSearch] = useState('')

  // Load notification history
  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemNotification)))
      setLoadingHistory(false)
    }, (err) => {
      console.error(err)
      toast.error('Lỗi khi tải lịch sử thông báo')
      setLoadingHistory(false)
    })
  }, [])

  // Load target lists for custom selector
  useEffect(() => {
    if (!showComposeModal || scope === 'all') return

    const loadTargets = async () => {
      setLoadingTargets(true)
      try {
        if (targetType === 'teachers') {
          const snap = await getDocs(query(collection(db, 'teachers'), where('status', '==', 'active')))
          setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)))
        } else if (targetType === 'students') {
          const snap = await getDocs(query(collection(db, 'students'), where('status', '==', 'active')))
          setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)))
        } else if (targetType === 'managers') {
          const snap = await getDocs(collection(db, 'users'))
          const list = snap.docs
            .map(d => d.data())
            .filter(u => u.role === 'student_manager' || u.role === 'teacher_manager' || u.role === 'admin')
          setManagers(list)
        }
      } catch (err) {
        console.error(err)
        toast.error('Lỗi khi tải danh sách đối tượng')
      } finally {
        setLoadingTargets(false)
      }
    }

    loadTargets()
  }, [showComposeModal, scope, targetType])

  // Reset selected IDs when targetType or scope changes
  useEffect(() => {
    setSelectedIds([])
    setTargetSearch('')
  }, [targetType, scope])

  const handleToggleSelectId = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllFiltered = (filteredIds: string[]) => {
    setSelectedIds(prev => {
      const otherIds = prev.filter(id => !filteredIds.includes(id))
      const allSelected = filteredIds.every(id => prev.includes(id))
      if (allSelected) {
        // Deselect all filtered
        return otherIds
      } else {
        // Select all filtered
        return Array.from(new Set([...prev, ...filteredIds]))
      }
    })
  }

  const handleSend = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung')
      return
    }
    if (scope === 'specific' && selectedIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một người nhận')
      return
    }

    setSending(true)
    try {
      await addDoc(collection(db, 'notifications'), {
        title: title.trim(),
        content: content.trim(),
        color: selectedColor,
        iconName: selectedIcon,
        targetType,
        targetIds: scope === 'all' ? [] : selectedIds,
        senderId: user?.uid || 'admin',
        senderName: user?.email || 'Admin',
        createdAt: serverTimestamp(),
        readBy: [],
      })

      toast.success('Gửi thông báo thành công!')
      setShowComposeModal(false)

      // Reset form
      setTitle('')
      setContent('')
      setSelectedColor('indigo')
      setSelectedIcon('Bell')
      setTargetType('teachers')
      setScope('all')
      setSelectedIds([])
    } catch (err) {
      console.error(err)
      toast.error('Gửi thông báo thất bại')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteNotify) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'notifications', deleteNotify.id))
      toast.success('Đã xóa thông báo khỏi hệ thống')
      setDeleteNotify(null)
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi xóa thông báo')
    } finally {
      setDeleting(false)
    }
  }

  // Filter list of targets based on search query
  const getFilteredTargets = () => {
    const queryStr = targetSearch.trim().toLowerCase()
    if (targetType === 'teachers') {
      return teachers.filter(t => t.name.toLowerCase().includes(queryStr) || t.code.toLowerCase().includes(queryStr))
    }
    if (targetType === 'students') {
      return students.filter(s => s.name.toLowerCase().includes(queryStr) || s.code.toLowerCase().includes(queryStr))
    }
    if (targetType === 'managers') {
      return managers.filter(m => (m.username || '').toLowerCase().includes(queryStr) || m.email.toLowerCase().includes(queryStr))
    }
    return []
  }

  const filteredTargets = getFilteredTargets()

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white shadow-lg shadow-indigo-100/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Bell className="h-6 w-6 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Thông báo hệ thống</h1>
              <p className="mt-1 text-sm text-indigo-100">Gửi thông báo, nhắc lịch dạy học đến giáo viên, học viên hoặc quản lý.</p>
            </div>
          </div>
          <Button onClick={() => setShowComposeModal(true)} variant="secondary" size="md" className="shrink-0 bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm border-0 font-bold">
            <Plus className="w-4 h-4 mr-1.5" />
            Soạn thông báo
          </Button>
        </div>
      </div>

      {/* List of sent notifications */}
      <Card>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          Lịch sử đã gửi
        </h2>

        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Chưa có thông báo nào được gửi đi.</p>
            <p className="text-slate-400 text-xs mt-1">Bấm nút "Soạn thông báo" phía trên để bắt đầu gửi thông báo đầu tiên.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notify) => {
              const colorConfig = COLORS.find(c => c.key === notify.color) || COLORS[0]
              const iconConfig = ICONS.find(i => i.key === notify.iconName) || ICONS[0]
              const IconComp = iconConfig.icon
              
              return (
                <div
                  key={notify.id}
                  className="flex gap-4 p-4 rounded-2xl border border-slate-200 bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-200"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${colorConfig.bg}`}>
                    <IconComp className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm">{notify.title}</h3>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${colorConfig.bg}`}>
                        {notify.targetType === 'teachers'
                          ? 'Khối Giáo viên'
                          : notify.targetType === 'students'
                          ? 'Khối Học viên'
                          : 'Khối Quản lý'}
                        {notify.targetIds && notify.targetIds.length > 0
                          ? ` (${notify.targetIds.length} người nhận)`
                          : ' (Tất cả)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed break-words whitespace-pre-wrap">{notify.content}</p>
                    
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1 font-semibold flex-wrap">
                      <span>Người gửi: {notify.senderName}</span>
                      <span>•</span>
                      <span>
                        {notify.createdAt?.toDate().toLocaleString('vi-VN')}
                      </span>
                      {notify.readBy && notify.readBy.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Đã đọc: {notify.readBy.length} người
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-start">
                    <button
                      onClick={() => setDeleteNotify(notify)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      aria-label="Xóa thông báo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Compose Notification Modal */}
      {showComposeModal && (
        <Modal
          open
          onClose={() => setShowComposeModal(false)}
          title="Soạn thảo thông báo mới"
          footer={
            <div className="flex gap-3 justify-end w-full">
              <Button variant="ghost" onClick={() => setShowComposeModal(false)}>Hủy</Button>
              <Button onClick={handleSend} loading={sending} className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Send className="w-4 h-4 mr-1.5" />
                Gửi thông báo
              </Button>
            </div>
          }
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <Input
              label="Tiêu đề thông báo *"
              placeholder="VD: Cập nhật lịch trống tuần mới"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">Nội dung thông báo *</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nhập nội dung nhắc nhở hoặc thông báo chi tiết..."
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
              />
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Màu sắc chủ đề hiển thị</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSelectedColor(c.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      selectedColor === c.key
                        ? `${c.bg} ring-2 ring-indigo-500/20`
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${c.fill}`} />
                    {c.key === 'indigo'
                      ? 'Xanh dương'
                      : c.key === 'emerald'
                      ? 'Lục'
                      : c.key === 'amber'
                      ? 'Vàng'
                      : c.key === 'rose'
                      ? 'Đỏ'
                      : 'Lam'}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Biểu tượng thông báo</label>
              <div className="grid grid-cols-6 gap-2">
                {ICONS.map((i) => {
                  const Icon = i.icon
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => setSelectedIcon(i.key)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                        selectedIcon === i.key
                          ? 'border-indigo-500 bg-indigo-50/50 text-indigo-600 ring-2 ring-indigo-500/10'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Target Audience selection */}
            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Nhóm đối tượng nhận *</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
                >
                  <option value="teachers">Khối Giáo viên (Teachers)</option>
                  <option value="students">Khối Học viên (Students/Parents)</option>
                  <option value="managers">Khối Quản lý (Managers/Staff)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Phạm vi gửi *</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
                >
                  <option value="all">Gửi cho toàn bộ nhóm</option>
                  <option value="specific">Chỉ gửi cho một số người cụ thể</option>
                </select>
              </div>
            </div>

            {/* Specific targets checklist selection */}
            {scope === 'specific' && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <label className="block text-xs font-bold text-slate-500 uppercase">
                    Chọn người nhận ({selectedIds.length} đã chọn)
                  </label>
                  {filteredTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSelectAllFiltered(filteredTargets.map(t => t.id || t.uid))}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      {filteredTargets.every(t => selectedIds.includes(t.id || t.uid)) ? 'Bỏ chọn trang này' : 'Chọn cả trang này'}
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    placeholder="Tìm theo tên hoặc mã định danh..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700"
                  />
                </div>

                {loadingTargets ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredTargets.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Không tìm thấy người nào khớp.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-slate-50/50 p-2 space-y-1.5">
                    {filteredTargets.map((item) => {
                      const id = item.id || item.uid
                      const name = item.name || item.username || item.email
                      const subText = item.code || item.email || ''
                      const isSelected = selectedIds.includes(id)
                      
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleToggleSelectId(id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                              : 'border-slate-100 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{name}</p>
                            {subText && subText !== name && (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{subText}</p>
                            )}
                          </div>
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteNotify && (
        <ConfirmDialog
          open
          onClose={() => setDeleteNotify(null)}
          onConfirm={handleDelete}
          title="Xóa thông báo này?"
          confirmLabel="Xóa"
          loading={deleting}
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-500 text-center leading-normal">
              Hành động này sẽ xóa vĩnh viễn thông báo này khỏi cơ sở dữ liệu. Người dùng sẽ không thể xem lại thông báo này.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
