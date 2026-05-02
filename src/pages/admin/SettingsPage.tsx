import { Card } from '@/components/ui/Card'
import { Settings } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Cài đặt</h1>
        <p className="text-sm text-slate-400 mt-0.5">Quản lý cài đặt hệ thống</p>
      </div>
      <Card className="text-center py-12">
        <Settings className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Tính năng đang phát triển</p>
      </Card>
    </div>
  )
}
