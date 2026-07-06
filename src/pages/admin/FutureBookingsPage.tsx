import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  collection, query, where, onSnapshot, runTransaction, doc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Student } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ArrowLeft, Trash2, Calendar, Search, Filter, AlertCircle } from 'lucide-react'

export function FutureBookingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const [students, setStudents] = useState<Student[]>([])
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([])

  // Search & Filter state
  const [selectedStudentId, setSelectedStudentId] = useState<string>(searchParams.get('studentId') || 'all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Sync state with URL search params
  useEffect(() => {
    const studentIdParam = searchParams.get('studentId')
    if (studentIdParam) {
      setSelectedStudentId(studentIdParam)
    } else {
      setSelectedStudentId('all')
    }
  }, [searchParams])

  // Load students list
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student))
      list.sort((a, b) => a.name.localeCompare(b.name))
      setStudents(list)
    })
    return unsub
  }, [])

  // Load all confirmed booking requests
  useEffect(() => {
    const q = query(
      collection(db, 'bookingRequests'),
      where('status', '==', 'confirmed')
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
      setBookings(list)
      setLoading(false)
    })
    return unsub
  }, [])

  // Filter and sort bookings client-side
  const futureBookings = useMemo(() => {
    const todayISO = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    const filtered = bookings.filter((b) => {
      // 1. Must be future booking and not taught yet
      const isFuture = b.requestedDate && b.requestedDate >= todayISO && !b.lessonId
      if (!isFuture) return false

      // 2. Student filter
      const matchesStudent = selectedStudentId === 'all' || b.studentId === selectedStudentId

      // 3. Search query filter (student name, code or teacher name)
      const queryLower = searchQuery.toLowerCase().trim()
      const matchesSearch = !queryLower ||
        (b.studentName || '').toLowerCase().includes(queryLower) ||
        (b.studentCode || '').toLowerCase().includes(queryLower) ||
        (b.teacherName || '').toLowerCase().includes(queryLower) ||
        (b.subjectName || '').toLowerCase().includes(queryLower)

      return matchesStudent && matchesSearch
    })

    // Sort by Date then Start Time
    return [...filtered].sort((a, b) => {
      const dateA = a.requestedDate || ''
      const dateB = b.requestedDate || ''
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.requestedStart || '').localeCompare(b.requestedStart || '')
    })
  }, [bookings, selectedStudentId, searchQuery])

  // Handle student filter change
  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId)
    if (studentId === 'all') {
      searchParams.delete('studentId')
    } else {
      searchParams.set('studentId', studentId)
    }
    setSearchParams(searchParams)
    setSelectedBookingIds([])
  }

  // Bulk / Individual cancel bookings and refund minutes
  const handleCancelBookings = async (targetBookings: BookingRequest[]) => {
    if (targetBookings.length === 0) return

    const confirmMessage = targetBookings.length === 1
      ? `Hủy ca học ngày ${targetBookings[0].requestedDate} lúc ${targetBookings[0].requestedStart} của học viên ${targetBookings[0].studentName || ''}?`
      : `Bạn có chắc chắn muốn hủy ${targetBookings.length} ca học đã chọn và hoàn lại số phút cho các học viên tương ứng?`

    if (!window.confirm(confirmMessage)) return

    setCancelling(true)
    try {
      // Group bookings by studentId
      const bookingsByStudent: Record<string, BookingRequest[]> = {}
      targetBookings.forEach((b) => {
        if (!b.studentId) return
        if (!bookingsByStudent[b.studentId]) {
          bookingsByStudent[b.studentId] = []
        }
        bookingsByStudent[b.studentId].push(b)
      })

      // Run a transaction per student to update their minutes and documents safely
      for (const [studentId, studentBookings] of Object.entries(bookingsByStudent)) {
        const totalMinutesToRefund = studentBookings.reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)

        await runTransaction(db, async (tx) => {
          const studentRef = doc(db, 'students', studentId)
          const studentSnap = await tx.get(studentRef)
          if (!studentSnap.exists()) return

          const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student
          const currentHeld = studentData.reservedMinutes ?? studentData.heldMinutes ?? 0
          const nextHeld = Math.max(0, currentHeld - totalMinutesToRefund)

          const nextSubjects = (studentData.subjects || []).map((sub) => {
            const refundForSub = studentBookings
              .filter(b => b.subjectId === sub.subjectId)
              .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)

            if (refundForSub > 0) {
              const nextRem = (sub.remainingMinutes || 0) + refundForSub
              return {
                ...sub,
                remainingMinutes: nextRem,
                remainingSessions: Math.floor(nextRem / 25)
              }
            }
            return sub
          })

          let nextRemainingSessions = studentData.remainingSessions
          let nextRemainingMinutes = studentData.remainingMinutes
          const refundForPrimary = studentBookings
            .filter(b => b.subjectId === studentData.subjectId)
            .reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)

          if (refundForPrimary > 0 && typeof studentData.remainingMinutes === 'number') {
            nextRemainingMinutes = (studentData.remainingMinutes || 0) + refundForPrimary
            nextRemainingSessions = Math.floor(nextRemainingMinutes / 25)
          }

          tx.update(studentRef, {
            reservedMinutes: nextHeld,
            heldMinutes: nextHeld,
            subjects: nextSubjects,
            remainingMinutes: nextRemainingMinutes,
            remainingSessions: nextRemainingSessions,
            updatedAt: serverTimestamp(),
          })

          // Mark bookings as released
          for (const booking of studentBookings) {
            const requestRef = doc(db, 'bookingRequests', booking.id)
            tx.update(requestRef, {
              status: 'released',
              releasedAt: serverTimestamp(),
              releasedBy: user?.uid ?? 'admin',
            })
          }

          // Log bulk cancellation
          tx.set(doc(collection(db, 'adminLogs')), {
            adminId: user?.uid ?? 'admin',
            action: 'CANCEL_SPECIFIC_BOOKINGS_BULK',
            targetType: 'student',
            targetId: studentId,
            changes: {
              studentName: studentData.name,
              cancelledCount: studentBookings.length,
              cancelledIds: studentBookings.map(b => b.id),
              refundedMinutes: totalMinutesToRefund,
            },
            createdAt: serverTimestamp(),
          })
        })
      }

      toast.success(`Hủy thành công ${targetBookings.length} ca học và hoàn trả phút cho học viên tương ứng.`)
      setSelectedBookingIds([])
    } catch (err) {
      console.error('Cancel bookings failed:', err)
      toast.error('Gặp lỗi khi hủy các ca học đã chọn')
    } finally {
      setCancelling(false)
    }
  }

  // Compute stats for current filtered list
  const totalMinutes = useMemo(() => {
    return futureBookings.reduce((sum, b) => sum + (b.requestedMinutes || 0), 0)
  }, [futureBookings])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Lịch học đã đặt (Tương lai)</h1>
          <p className="text-sm text-slate-500">Quản lý và hủy lịch học đã giữ chỗ của học viên</p>
        </div>
      </div>

      {/* Filter and stats card */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            {/* Student Filter */}
            <div className="w-full sm:w-72">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Lọc theo học viên
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => handleStudentChange(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tất cả học viên</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Search className="w-3 h-3" />
                Tìm kiếm thông tin
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nhập tên/mã học viên, giáo viên hoặc môn học..."
                  className="h-10 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-slate-50 border border-slate-200/50 rounded-xl px-4 py-3 flex gap-8 flex-shrink-0">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tổng số ca</span>
              <span className="text-xl font-bold text-slate-800">{futureBookings.length} ca</span>
            </div>
            <div className="border-l border-slate-200/60 pl-8">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tổng số phút</span>
              <span className="text-xl font-bold text-indigo-600">{totalMinutes} phút</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-slate-900 text-sm">
            Danh sách ca học ({futureBookings.length} ca khớp bộ lọc)
          </span>
          {selectedBookingIds.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              loading={cancelling}
              onClick={() => {
                const targets = futureBookings.filter((b) => selectedBookingIds.includes(b.id))
                handleCancelBookings(targets)
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Hủy {selectedBookingIds.length} ca đã chọn
            </Button>
          )}
        </div>

        {futureBookings.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6 text-slate-300" />
            Không tìm thấy ca học nào trong tương lai thỏa mãn bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="p-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      checked={futureBookings.length > 0 && selectedBookingIds.length === futureBookings.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBookingIds(futureBookings.map((b) => b.id))
                        } else {
                          setSelectedBookingIds([])
                        }
                      }}
                    />
                  </th>
                  <th className="p-3.5">Học viên</th>
                  <th className="p-3.5">Thời gian</th>
                  <th className="p-3.5">Môn học</th>
                  <th className="p-3.5">Giáo viên</th>
                  <th className="p-3.5">Số phút</th>
                  <th className="p-3.5 text-center">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {futureBookings.map((booking) => {
                  const isChecked = selectedBookingIds.includes(booking.id)
                  const dayLabels: Record<string, string> = {
                    mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật'
                  }
                  const dayStr = dayLabels[booking.requestedDay || ''] || ''

                  return (
                    <tr key={booking.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-slate-700 transition-colors">
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBookingIds(prev => [...prev, booking.id])
                            } else {
                              setSelectedBookingIds(prev => prev.filter(id => id !== booking.id))
                            }
                          }}
                        />
                      </td>
                      <td className="p-3.5 font-medium text-slate-900">
                        <div>
                          <span>{booking.studentName}</span>
                          <span className="block text-xs font-mono text-slate-400 mt-0.5">{booking.studentCode}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold text-slate-700">{dayStr} ({booking.requestedDate})</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">
                          {booking.requestedStart} - {booking.requestedEnd}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600">{booking.subjectName}</td>
                      <td className="p-3.5 text-slate-600 font-medium">{booking.teacherName || 'Chưa phân công'}</td>
                      <td className="p-3.5 font-mono text-slate-500">{booking.requestedMinutes} phút</td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={() => handleCancelBookings([booking])}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Hủy ca này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
