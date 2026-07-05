import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, updateDoc, doc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SystemNotification } from '@/types'
import {
  Bell, X, CheckCheck, AlertCircle, Calendar, ClipboardList,
  ShieldAlert, Clock, MessageSquare
} from 'lucide-react'
import { toast } from '@/stores/toastStore'

interface NotificationDrawerProps {
  targetType: 'teachers' | 'students' | 'managers'
  targetId: string
}

const COLORS = {
  indigo: { bg: 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/50', border: 'border-indigo-100', dot: 'bg-indigo-500' },
  emerald: { bg: 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100/50', border: 'border-amber-100', dot: 'bg-amber-500' },
  rose: { bg: 'bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100/50', border: 'border-rose-100', dot: 'bg-rose-500' },
  sky: { bg: 'bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100/50', border: 'border-sky-100', dot: 'bg-sky-500' },
}

const ICONS = {
  Bell: Bell,
  Calendar: Calendar,
  ClipboardList: ClipboardList,
  ShieldAlert: ShieldAlert,
  Clock: Clock,
  MessageSquare: MessageSquare,
}

export function NotificationDrawer({ targetType, targetId }: NotificationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch notifications for target
  useEffect(() => {
    if (!targetId) {
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'notifications'),
      where('targetType', '==', targetType)
    )

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SystemNotification))
        .filter(n => n.targetIds.length === 0 || n.targetIds.includes(targetId))
        // sort by createdAt desc
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis() || 0
          const tB = b.createdAt?.toMillis() || 0
          return tB - tA
        })
      setNotifications(list)
      setLoading(false)
    }, (err) => {
      console.error('Error fetching notifications:', err)
      setLoading(false)
    })

    return unsub
  }, [targetType, targetId])

  const unreadCount = notifications.filter(n => !n.readBy?.includes(targetId)).length

  const handleMarkAsRead = async (notifyId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifyId), {
        readBy: arrayUnion(targetId)
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.readBy?.includes(targetId))
    if (unread.length === 0) return
    try {
      await Promise.all(
        unread.map(n =>
          updateDoc(doc(db, 'notifications', n.id), {
            readBy: arrayUnion(targetId)
          })
        )
      )
      toast.success('Đã đánh dấu đọc tất cả thông báo')
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi đánh dấu đọc')
    }
  }

  return (
    <>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-50 rounded-full border border-slate-200 shadow-sm transition-all focus:outline-none shrink-0"
        aria-label="Xem thông báo"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4.5 h-4.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Drawer Overlay Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 transition-opacity animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer Body Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 border-l border-slate-100 flex flex-col transition-all duration-300 transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">Thông báo</h2>
            {unreadCount > 0 && (
              <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                {unreadCount} mới
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="p-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Đọc tất cả"
              >
                <CheckCheck className="w-4 h-4" />
                Đọc tất cả
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-xs font-semibold">Chưa có thông báo nào dành cho bạn.</p>
            </div>
          ) : (
            notifications.map((notify) => {
              const isRead = notify.readBy?.includes(targetId)
              const colorConf = COLORS[notify.color] || COLORS.indigo
              const Icon = ICONS[notify.iconName] || Bell
              
              return (
                <div
                  key={notify.id}
                  onClick={() => !isRead && handleMarkAsRead(notify.id)}
                  className={`flex gap-3 p-3.5 rounded-2xl border transition-all duration-200 relative ${
                    isRead
                      ? 'bg-white border-slate-100 opacity-70 hover:opacity-100 hover:shadow-sm'
                      : `bg-white border-slate-200 hover:shadow-md cursor-pointer ${colorConf.border}`
                  }`}
                >
                  {/* Unread Indicator Dot */}
                  {!isRead && (
                    <span className={`absolute top-3.5 right-3.5 w-2 h-2 rounded-full ${colorConf.dot}`} />
                  )}

                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${colorConf.bg}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <p className={`text-xs font-extrabold text-slate-900 truncate ${!isRead ? 'pr-2' : ''}`}>{notify.title}</p>
                    <p className="text-xs text-slate-600 leading-normal mt-0.5 break-words whitespace-pre-wrap">{notify.content}</p>
                    <p className="text-[9px] text-slate-400 font-semibold mt-1.5 flex items-center gap-1.5">
                      <span>{notify.senderName}</span>
                      <span>•</span>
                      <span>{notify.createdAt?.toDate().toLocaleDateString('vi-VN')}</span>
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
