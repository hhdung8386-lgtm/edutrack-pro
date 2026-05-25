import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { DayOfWeek, DayAvailability, TimeRange } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { Calendar, Clock, Save, X, Plus, CheckCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const DEFAULT_SLOT: DayAvailability = { available: false, timeRanges: [] }

function getEmptySlots(): Record<DayOfWeek, DayAvailability> {
  return {
    mon: { ...DEFAULT_SLOT, timeRanges: [] },
    tue: { ...DEFAULT_SLOT, timeRanges: [] },
    wed: { ...DEFAULT_SLOT, timeRanges: [] },
    thu: { ...DEFAULT_SLOT, timeRanges: [] },
    fri: { ...DEFAULT_SLOT, timeRanges: [] },
    sat: { ...DEFAULT_SLOT, timeRanges: [] },
    sun: { ...DEFAULT_SLOT, timeRanges: [] },
  }
}

export function AvailabilityPage() {
  const { teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [slots, setSlots] = useState<Record<DayOfWeek, DayAvailability>>(getEmptySlots())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Timestamp | null>(null)

  useEffect(() => {
    if (!teacherId) {
      setLoading(false)
      return
    }
    getDoc(doc(db, 'teacherAvailability', teacherId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.slots) setSlots(data.slots)
        if (data.note) setNote(data.note)
        if (data.updatedAt) setLastUpdated(data.updatedAt)
      }
      setLoading(false)
    })
  }, [teacherId])

  const toggleDay = (day: DayOfWeek) => {
    setSlots((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        available: !prev[day].available,
        timeRanges: !prev[day].available ? [{ start: '08:00', end: '12:00' }] : [],
      },
    }))
  }

  const addTimeRange = (day: DayOfWeek) => {
    setSlots((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRanges: [...prev[day].timeRanges, { start: '13:00', end: '17:00' }],
      },
    }))
  }

  const removeTimeRange = (day: DayOfWeek, index: number) => {
    setSlots((prev) => {
      const newRanges = prev[day].timeRanges.filter((_, i) => i !== index)
      return {
        ...prev,
        [day]: {
          ...prev[day],
          timeRanges: newRanges,
          available: newRanges.length > 0,
        },
      }
    })
  }

  const updateTimeRange = (day: DayOfWeek, index: number, field: keyof TimeRange, value: string) => {
    setSlots((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRanges: prev[day].timeRanges.map((tr, i) =>
          i === index ? { ...tr, [field]: value } : tr
        ),
      },
    }))
  }

  const handleSave = async () => {
    if (!teacherId) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'teacherAvailability', teacherId), {
        teacherId,
        slots,
        note,
        updatedAt: serverTimestamp(),
      })
      // Re-fetch to get the server timestamp
      const snap = await getDoc(doc(db, 'teacherAvailability', teacherId))
      if (snap.exists()) {
        setLastUpdated(snap.data().updatedAt)
      }
      toast.success(t('avail.saved'))
    } catch (e) {
      console.error(e)
      toast.error(t('avail.save_fail'))
    }
    setSaving(false)
  }

  if (loading) return <LoadingSpinner />

  const dayLabels: Record<DayOfWeek, string> = {
    mon: t('avail.mon'), tue: t('avail.tue'), wed: t('avail.wed'), thu: t('avail.thu'),
    fri: t('avail.fri'), sat: t('avail.sat'), sun: t('avail.sun'),
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-4xl mx-auto">
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#3BB8EB] via-[#45c6f5] to-[#2b8fb8] p-6 lg:p-8 text-white shadow-lg">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">{t('avail.title')}</h1>
            <p className="text-sm text-white/80 mt-1">{t('avail.subtitle')}</p>
          </div>
        </div>
        {lastUpdated && (
          <div className="relative mt-4 flex items-center gap-1.5 text-xs text-white/70">
            <CheckCircle className="w-3.5 h-3.5" />
            {t('avail.last_updated')} {lastUpdated.toDate().toLocaleString('vi-VN')}
          </div>
        )}
      </div>

      {/* Weekly Grid - Desktop */}
      <div className="hidden lg:grid grid-cols-7 gap-3">
        {DAYS.map((day) => {
          const slot = slots[day]
          const isOn = slot.available
          return (
            <div
              key={day}
              className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                isOn
                  ? 'border-emerald-300 bg-emerald-50/50 shadow-sm'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {/* Day Header / Toggle */}
              <button
                onClick={() => toggleDay(day)}
                className={`w-full p-3 text-center transition-all duration-200 ${
                  isOn
                    ? 'bg-emerald-100'
                    : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <p className={`text-sm font-bold ${isOn ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {dayLabels[day]}
                </p>
                <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isOn
                    ? 'bg-emerald-200 text-emerald-800'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {isOn ? t('avail.available') : t('avail.unavailable')}
                </span>
              </button>

              {/* Time Ranges */}
              {isOn && (
                <div className="p-2.5 space-y-2">
                  {slot.timeRanges.map((tr, i) => (
                    <div key={i} className="relative bg-white rounded-lg border border-emerald-200 p-2">
                      <button
                        onClick={() => removeTimeRange(day, i)}
                        aria-label={`${t('avail.remove_time')} ${dayLabels[day]} #${i + 1}`}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center hover:bg-rose-200 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="space-y-1.5">
                        <select
                          value={tr.start}
                          onChange={(e) => updateTimeRange(day, i, 'start', e.target.value)}
                          aria-label={`${t('avail.start')} - ${dayLabels[day]} #${i + 1}`}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        >
                          {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className="text-center text-[10px] text-slate-400">↓</div>
                        <select
                          value={tr.end}
                          onChange={(e) => updateTimeRange(day, i, 'end', e.target.value)}
                          aria-label={`${t('avail.end')} - ${dayLabels[day]} #${i + 1}`}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        >
                          {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => addTimeRange(day)}
                    className="w-full text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold py-1 rounded hover:bg-emerald-50 transition-colors"
                  >
                    {t('avail.add_time')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Weekly Grid - Mobile (stacked) */}
      <div className="lg:hidden space-y-3">
        {DAYS.map((day) => {
          const slot = slots[day]
          const isOn = slot.available
          return (
            <Card key={day} className={`overflow-hidden transition-all duration-300 ${isOn ? '!border-emerald-300 !bg-emerald-50/30' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                    isOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {dayLabels[day]}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isOn ? t('avail.available') : t('avail.unavailable')}
                  </span>
                </div>
                <button
                  onClick={() => toggleDay(day)}
                  aria-label={`${dayLabels[day]} - ${isOn ? t('avail.available') : t('avail.unavailable')}`}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    isOn ? 'bg-emerald-400' : 'bg-slate-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                    isOn ? 'left-[26px]' : 'left-0.5'
                  }`} />
                </button>
              </div>

              {isOn && (
                <div className="mt-3 space-y-2 pt-3 border-t border-emerald-200/50">
                  {slot.timeRanges.map((tr, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-emerald-200 p-2.5">
                      <Clock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <select
                        value={tr.start}
                        onChange={(e) => updateTimeRange(day, i, 'start', e.target.value)}
                        aria-label={`${t('avail.start')} - ${dayLabels[day]} #${i + 1}`}
                        className="flex-1 text-sm px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-xs text-slate-400">→</span>
                      <select
                        value={tr.end}
                        onChange={(e) => updateTimeRange(day, i, 'end', e.target.value)}
                        aria-label={`${t('avail.end')} - ${dayLabels[day]} #${i + 1}`}
                        className="flex-1 text-sm px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button
                        onClick={() => removeTimeRange(day, i)}
                        aria-label={`${t('avail.remove_time')} ${dayLabels[day]} #${i + 1}`}
                        className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addTimeRange(day)}
                    className="w-full flex items-center justify-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-semibold py-2 rounded-lg hover:bg-emerald-50 transition-colors border border-dashed border-emerald-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('avail.add_time')}
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Note */}
      <Card>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{t('avail.note')}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('avail.note_placeholder')}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3BB8EB]/40 focus:border-[#3BB8EB] resize-none transition-all"
          rows={3}
        />
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-20 lg:bottom-4 z-10">
        <Button
          fullWidth
          loading={saving}
          onClick={handleSave}
          className="!bg-gradient-to-r !from-[#3BB8EB] !to-[#2b8fb8] hover:!from-[#2ba8d8] hover:!to-[#237fa5] !shadow-lg !shadow-[#3BB8EB]/30 !rounded-xl !py-3.5"
        >
          <Save className="w-4 h-4" />
          {saving ? t('avail.saving') : t('avail.save')}
        </Button>
      </div>
    </div>
  )
}
