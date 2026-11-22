// Web版の日付ピッカー。@react-native-community/datetimepicker と同じ props(value / onChange / mode)で
// <input type="date"> を出す。表示された時点でブラウザのカレンダーを開く(開けないブラウザでは入力欄をクリック)。
import React, { useEffect, useRef } from 'react'

type Props = {
  value: Date
  mode?: 'date' | 'time' | 'datetime'
  onChange?: (event: { type: 'set' | 'dismissed' }, date?: Date) => void
  minimumDate?: Date
  maximumDate?: Date
  [key: string]: any
}

function ymd(d?: Date) {
  if (!d || isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function DateTimePicker({ value, onChange, minimumDate, maximumDate }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { (ref.current as any)?.showPicker?.() } catch {}
  }, [])

  return (
    <input
      ref={ref}
      type="date"
      value={ymd(value)}
      min={ymd(minimumDate) || undefined}
      max={ymd(maximumDate) || undefined}
      onChange={e => {
        const v = e.target.value
        if (!v) return
        const [y, m, d] = v.split('-').map(Number)
        const next = new Date(value)
        next.setFullYear(y, m - 1, d)
        onChange?.({ type: 'set' }, next)
      }}
      style={{
        fontSize: 16,
        padding: '10px 12px',
        margin: '8px 0',
        border: '1px solid var(--fo-border)',
        borderRadius: 10,
        fontFamily: 'inherit',
        color: 'var(--fo-text)',
        background: 'var(--fo-card)',
      }}
    />
  )
}
