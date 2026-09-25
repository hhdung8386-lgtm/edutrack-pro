import { Users } from 'lucide-react'
import {
  CLASS_HUNT_STUDENT_AUDIENCE_LABELS,
  CLASS_HUNT_STUDENT_AUDIENCE_TAG_CLASSES,
  type ClassHuntStudentAudience,
} from '@/lib/classHunting'

/** Coloured "Đối tượng" chip for a CLASS HUNTING offer (Trẻ em / Thanh thiếu niên / Người lớn). */
export function StudentAudienceTag({ audience, className = '' }: { audience: ClassHuntStudentAudience; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-extrabold ${CLASS_HUNT_STUDENT_AUDIENCE_TAG_CLASSES[audience]} ${className}`}
    >
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      {CLASS_HUNT_STUDENT_AUDIENCE_LABELS[audience]}
    </span>
  )
}
