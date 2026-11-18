// 部屋のモニタ(CHUWI UBook X など横置きタブレット)用ダッシュボード。
// 時計・天気・ごみの日・予定・TODO・買い物・期限が近いもの・書類 を1画面で見る。
// 見るだけでなく、買い物のチェックと TODO の完了はタップでできる(削除はできない)。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/lib/AuthContext'
import { ModeSwitch } from '@/components/ModeSwitch'
import { setViewMode } from '@/lib/viewMode'

const WD = ['日', '月', '火', '水', '木', '金', '土']
const MUNI: Record<string, string> = { '23213': '西尾市' }

type GarbageRule = { name: string; weekdays: number[]; nth?: number[] | null }
type GarbageSchedule = { area: string; rules: GarbageRule[]; closed_ranges: { from: string; to: string }[]; put_out_by: string | null }
type Home = { lat: number; lon: number; label: string | null; muni_code: string | null }
type Ev = { date: string; time?: string | null; label: string; kind: 'event' | 'todo' | 'expiry' | 'birthday' }

// ---------- 日付まわり ----------
function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function md(iso: string) { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}` }
function wdOf(iso: string) { const [y, m, d] = iso.split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()] }
function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// ごみの日(DB の garbage_for_date と同じ考え方)
function garbageFor(s: GarbageSchedule | null, d: Date): string[] {
  if (!s) return []
  const iso = ymd(d)
  if (s.closed_ranges?.some(c => iso >= c.from && iso <= c.to)) return []
  const nth = Math.floor((d.getDate() - 1) / 7) + 1
  return s.rules.filter(r => r.weekdays.includes(d.getDay()) && (!r.nth || r.nth.includes(nth))).map(r => r.name)
}
function shortGarbage(name: string) { return name.replace(/\(.*\)/, '') }

// ---------- 天気 ----------
function weatherInfo(code: number): { label: string; icon: any } {
  if (code === 0) return { label: '快晴', icon: 'sunny' }
  if (code === 1) return { label: '晴れ', icon: 'sunny-outline' }
  if (code === 2) return { label: '晴れ時々くもり', icon: 'partly-sunny-outline' }
  if (code === 3) return { label: 'くもり', icon: 'cloudy-outline' }
  if (code === 45 || code === 48) return { label: '霧', icon: 'cloudy-outline' }
  if (code >= 51 && code <= 57) return { label: '霧雨', icon: 'rainy-outline' }
  if (code >= 61 && code <= 67) return { label: code >= 65 ? '強い雨' : '雨', icon: 'rainy' }
  if (code >= 71 && code <= 77) return { label: '雪', icon: 'snow-outline' }
  if (code >= 80 && code <= 82) return { label: 'にわか雨', icon: 'rainy-outline' }
  if (code === 85 || code === 86) return { label: 'にわか雪', icon: 'snow-outline' }
  if (code >= 95) return { label: '雷雨', icon: 'thunderstorm-outline' }
  return { label: '—', icon: 'help-outline' }
}
type Weather = {
  temp: number; code: number
  days: { date: string; code: number; max: number; min: number; pop: number }[]
  hours: { hour: number; pop: number; temp: number }[]
}
async function fetchWeather(h: Home): Promise<Weather> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${h.lat}&longitude=${h.lon}` +
    `&current=temperature_2m,weather_code&hourly=precipitation_probability,temperature_2m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo&forecast_days=3`
  const w = await (await fetch(u)).json()
  const nowH = new Date().getHours()
  const hours = (w.hourly.time as string[]).map((t, i) => ({
    t, hour: Number(t.slice(11, 13)), pop: w.hourly.precipitation_probability[i], temp: w.hourly.temperature_2m[i],
  })).filter((x, i) => i >= nowH && i < nowH + 12 && i % 3 === nowH % 3)
  return {
    temp: w.current.temperature_2m, code: w.current.weather_code,
    days: (w.daily.time as string[]).map((date, i) => ({
      date, code: w.daily.weather_code[i], max: w.daily.temperature_2m_max[i],
      min: w.daily.temperature_2m_min[i], pop: w.daily.precipitation_probability_max[i],
    })),
    hours,
  }
}

// 現在地(ブラウザの位置情報)を町くらいの精度で取る
function getPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise(resolve => {
    const g = (globalThis as any).navigator?.geolocation
    if (!g) return resolve(null)
    g.getCurrentPosition(
      (p: any) => resolve({ lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000 }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 6 * 3600 * 1000 },
    )
  })
}
async function placeLabel(lat: number, lon: number): Promise<{ label: string; muni: string | null }> {
  try {
    const r = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`)).json()
    const muni = r?.results?.muniCd ?? null
    return { label: [muni && MUNI[muni], r?.results?.lv01Nm].filter(Boolean).join(' ') || '現在地', muni }
  } catch { return { label: '現在地', muni: null } }
}

// ---------- 色(夜は暗く) ----------
function palette(dark: boolean) {
  return dark
    ? { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155', accent: '#60A5FA', danger: '#F87171', warn: '#FBBF24', ok: '#34D399', chip: '#334155' }
    : { bg: '#EEF1F7', card: '#FFFFFF', text: '#111827', sub: '#6B7280', border: '#E5E7EB', accent: '#3B82F6', danger: '#DC2626', warn: '#B45309', ok: '#059669', chip: '#F3F4F6' }
}

export default function DashboardScreen() {
  const { household } = useAuthContext()
  const hid = household?.id ?? null
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const wide = width >= 900
  const [now, setNow] = useState(new Date())
  const dark = now.getHours() >= 19 || now.getHours() < 6
  const c = palette(dark)

  const [home, setHome] = useState<Home | null>(null)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [garbage, setGarbage] = useState<GarbageSchedule | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [todos, setTodos] = useState<{ id: string; name: string; expiration_date: string | null }[]>([])
  const [shopping, setShopping] = useState<{ id: string; name: string; quantity: number }[]>([])
  const [expiring, setExpiring] = useState<{ id: string; name: string; expiration_date: string; category: string }[]>([])
  const [docs, setDocs] = useState({ review: 0, error: 0 })
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const homeRef = useRef<Home | null>(null)

  // 時計
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])

  // この画面を開いたら、この端末はダッシュボードモード(URLを直接開いたときも同じ)
  useEffect(() => { setViewMode('dashboard') }, [])

  // 画面を消さない(スマホアプリ: この画面を開いている間だけ / Web: 対応ブラウザのみ)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      let KA: any = null
      try { KA = require('expo-keep-awake'); KA.activateKeepAwakeAsync('dashboard').catch(() => {}) } catch {}
      return () => { try { KA?.deactivateKeepAwake('dashboard')?.catch?.(() => {}) } catch {} }
    }
    let lock: any = null
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch {} }
    req()
    const onVis = () => { if (document.visibilityState === 'visible') req() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release() } catch {} }
  }, [])

  // データ読み込み
  const load = useCallback(async () => {
    if (!hid) return
    const today = ymd(new Date())
    const in7 = ymd(addDays(new Date(), 7))
    const in60 = ymd(addDays(new Date(), 60))
    const [homeR, gR, calR, recR, famR, shopR, docR, errR] = await Promise.all([
      supabase.from('household_home').select('lat, lon, label, muni_code').eq('household_id', hid).maybeSingle(),
      supabase.from('garbage_schedules').select('area, rules, closed_ranges, put_out_by').eq('household_id', hid).maybeSingle(),
      supabase.from('calendar_events').select('title, start_date, start_at, all_day, hidden')
        .eq('household_id', hid).gte('start_date', today).lte('start_date', in7).order('start_date').limit(60),
      supabase.from('records').select('id, name, category, expiration_date, completed')
        .eq('household_id', hid).eq('completed', false),
      supabase.from('family_members').select('name, birthday').eq('household_id', hid),
      supabase.from('shopping_items').select('id, name, quantity, checked').eq('household_id', hid).eq('checked', false).order('created_at'),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('household_id', hid).eq('status', 'needs_review'),
      supabase.from('pcloud_files').select('pcloud_id', { count: 'exact', head: true }).eq('household_id', hid).eq('ocr_status', 'error'),
    ])

    if (homeR.data) { setHome(homeR.data as Home); homeRef.current = homeR.data as Home }
    if (gR.data) setGarbage(gR.data as GarbageSchedule)

    const ev: Ev[] = []
    for (const e of (calR.data ?? []) as any[]) {
      if (e.hidden) continue
      const time = !e.all_day && e.start_at
        ? new Date(e.start_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
        : null
      ev.push({ date: e.start_date, time, label: e.title, kind: 'event' })
    }
    const recs = (recR.data ?? []) as any[]
    for (const r of recs) {
      if (!r.expiration_date || r.expiration_date < today || r.expiration_date > in7) continue
      ev.push({ date: r.expiration_date, label: r.name, kind: r.category === 'タスク' ? 'todo' : 'expiry' })
    }
    const y = new Date().getFullYear()
    for (const m of (famR.data ?? []) as any[]) {
      if (!m.birthday) continue
      const [, bm, bd] = m.birthday.split('-')
      for (const yy of [y, y + 1]) {
        const iso = `${yy}-${bm}-${bd}`
        if (iso >= today && iso <= in7) ev.push({ date: iso, label: `${m.name}の誕生日`, kind: 'birthday' })
      }
    }
    ev.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    setEvents(ev)

    setTodos(recs.filter(r => r.category === 'タスク')
      .sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999')))
    setExpiring(recs.filter(r => r.category !== 'タスク' && r.expiration_date && r.expiration_date >= today && r.expiration_date <= in60)
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date)))
    setShopping((shopR.data ?? []) as any)
    setDocs({ review: docR.count ?? 0, error: errR.count ?? 0 })
    setUpdatedAt(new Date())
  }, [hid])

  useEffect(() => {
    load()
    const t = setInterval(load, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  // 現在地で天気の場所を更新(大きく動いたときだけ保存)
  useEffect(() => {
    if (!hid) return
    let alive = true
    ;(async () => {
      const pos = await getPosition()
      if (!pos || !alive) return
      const cur = homeRef.current
      if (cur && Math.abs(cur.lat - pos.lat) < 0.01 && Math.abs(cur.lon - pos.lon) < 0.01) return
      const { label, muni } = await placeLabel(pos.lat, pos.lon)
      const next = { lat: pos.lat, lon: pos.lon, label, muni_code: muni }
      setHome(next); homeRef.current = next
      await supabase.from('household_home').upsert({ household_id: hid, ...next, updated_at: new Date().toISOString() })
    })()
    return () => { alive = false }
  }, [hid])

  // 天気(30分ごと)
  useEffect(() => {
    if (!home) return
    let alive = true
    const run = () => fetchWeather(home).then(w => { if (alive) setWeather(w) }).catch(() => {})
    run()
    const t = setInterval(run, 30 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [home?.lat, home?.lon])

  // ---------- 操作 ----------
  function completeTodo(t: { id: string; name: string }) {
    Alert.alert('TODOを完了にしますか?', t.name, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '完了', onPress: async () => {
        setTodos(prev => prev.filter(x => x.id !== t.id))
        await supabase.from('records').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', t.id)
        load()
      } },
    ])
  }
  function checkShopping(s: { id: string; name: string }) {
    Alert.alert('買いましたか?', s.name, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '買った', onPress: async () => {
        setShopping(prev => prev.filter(x => x.id !== s.id))
        await supabase.from('shopping_items').update({ checked: true, checked_at: new Date().toISOString() }).eq('id', s.id)
      } },
    ])
  }

  // ---------- 表示用の計算 ----------
  const today = ymd(now)
  const afternoon = now.getHours() >= 15
  const gToday = garbageFor(garbage, now)
  const gTomorrow = garbageFor(garbage, addDays(now, 1))
  const gWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i)
    return { iso: ymd(d), names: garbageFor(garbage, d) }
  }), [garbage, today])

  const grouped = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of events) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e) }
    return [...m.entries()]
  }, [events])

  const s = makeStyles(c, wide)
  const big = wide ? 1 : 0.85

  const card = (title: string, icon: any, children: React.ReactNode, extra?: object, onTitle?: () => void) => (
    <View style={[s.card, extra]}>
      <Pressable onPress={onTitle} disabled={!onTitle} style={s.cardHead}>
        <Ionicons name={icon} size={18} color={c.sub} />
        <Text style={s.cardTitle}>{title}</Text>
        {onTitle && <Ionicons name="chevron-forward" size={16} color={c.sub} />}
      </Pressable>
      {children}
    </View>
  )

  const wi = weather ? weatherInfo(weather.code) : null
  const todayW = weather?.days[0]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[s.page, { paddingTop: 14 + insets.top, paddingBottom: 14 + insets.bottom }]}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* 上段: 時計・天気・ごみ */}
      <View style={s.row}>
        <View style={[s.card, s.clockCard]}>
          <Text style={[s.clock, { fontSize: 64 * big }]}>
            {now.getHours()}:{String(now.getMinutes()).padStart(2, '0')}
          </Text>
          <Text style={s.date}>{now.getMonth() + 1}月{now.getDate()}日({WD[now.getDay()]})</Text>
          <View style={s.metaRow}>
            <Text style={s.meta}>{updatedAt ? `${updatedAt.getHours()}:${String(updatedAt.getMinutes()).padStart(2, '0')} 更新` : '読み込み中…'}</Text>
            <Pressable onPress={load} hitSlop={8}><Ionicons name="refresh" size={16} color={c.sub} /></Pressable>
          </View>
          <View style={{ marginTop: 12 }}>
            <ModeSwitch current="dashboard" palette={{ bg: c.chip, border: c.border, active: c.accent, text: c.sub }} />
          </View>
        </View>

        <View style={[s.card, s.weatherCard]}>
          <View style={s.cardHead}>
            <Ionicons name="location-outline" size={16} color={c.sub} />
            <Text style={s.cardTitle}>{home?.label ?? '天気'}</Text>
          </View>
          {weather && wi && todayW ? (
            <>
              <View style={s.weatherNow}>
                <Ionicons name={wi.icon} size={52 * big} color={c.accent} />
                <View>
                  <Text style={[s.temp, { fontSize: 40 * big }]}>{Math.round(weather.temp)}℃</Text>
                  <Text style={s.sub}>{wi.label}</Text>
                </View>
                <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                  <Text style={s.text}><Text style={{ color: c.danger }}>{Math.round(todayW.max)}℃</Text> / <Text style={{ color: c.accent }}>{Math.round(todayW.min)}℃</Text></Text>
                  <Text style={s.sub}>☂ {todayW.pop}%</Text>
                </View>
              </View>
              <View style={s.hours}>
                {weather.hours.map(h => (
                  <View key={h.hour} style={s.hour}>
                    <Text style={s.hourT}>{h.hour}時</Text>
                    <Text style={s.hourV}>{Math.round(h.temp)}°</Text>
                    <Text style={[s.hourP, h.pop >= 50 && { color: c.accent, fontWeight: '700' }]}>{h.pop}%</Text>
                  </View>
                ))}
                {weather.days.slice(1).map(d => (
                  <View key={d.date} style={[s.hour, { borderLeftWidth: 1, borderLeftColor: c.border }]}>
                    <Text style={s.hourT}>{md(d.date)}({wdOf(d.date)})</Text>
                    <Ionicons name={weatherInfo(d.code).icon} size={18} color={c.sub} />
                    <Text style={s.hourP}>{Math.round(d.max)}°/{Math.round(d.min)}°</Text>
                  </View>
                ))}
              </View>
            </>
          ) : <Text style={s.sub}>{home ? '天気を読み込み中…' : '場所が未設定です(位置情報を許可してください)'}</Text>}
        </View>

        <View style={[s.card, s.garbageCard, (afternoon ? gTomorrow : gToday).length > 0 && { borderColor: c.warn, borderWidth: 2 }]}>
          <View style={s.cardHead}>
            <Ionicons name="trash-outline" size={18} color={c.sub} />
            <Text style={s.cardTitle}>ごみの日{garbage?.put_out_by ? `(${garbage.put_out_by})` : ''}</Text>
          </View>
          {!garbage ? <Text style={s.sub}>未設定</Text> : (
            <>
              <Text style={s.gLabel}>{afternoon ? '明日' : '今日'}</Text>
              <Text style={[s.gMain, { fontSize: 26 * big }]}>
                {(afternoon ? gTomorrow : gToday).map(shortGarbage).join('・') || 'なし'}
              </Text>
              <Text style={s.sub}>{afternoon ? `今日: ${gToday.map(shortGarbage).join('・') || 'なし'}` : `明日: ${gTomorrow.map(shortGarbage).join('・') || 'なし'}`}</Text>
              <View style={s.gWeek}>
                {gWeek.slice(1).map(d => (
                  <View key={d.iso} style={s.gDay}>
                    <Text style={s.hourT}>{wdOf(d.iso)}</Text>
                    <Text style={s.gDayV} numberOfLines={2}>{d.names.map(n => shortGarbage(n).replace('燃やすしかないごみ', '燃やす').replace('燃えないごみ', '燃えない').replace('プラスチック資源', 'プラ')).join('\n') || '—'}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      {/* 下段: 予定 | TODO・期限 | 買い物・書類 (横置きでは画面の残りいっぱいに広げる) */}
      <View style={[s.row, wide && { flex: 1 }]}>
        {card('今日と今週の予定', 'calendar-outline', (
          grouped.length === 0 ? <Text style={s.sub}>予定はありません</Text> :
          grouped.slice(0, 7).map(([date, list]) => {
            const diff = daysBetween(today, date)
            return (
              <View key={date} style={{ marginBottom: 8 }}>
                <Text style={[s.dayHead, diff === 0 && { color: c.accent }]}>
                  {diff === 0 ? '今日' : diff === 1 ? '明日' : ''} {md(date)}({wdOf(date)})
                </Text>
                {list.slice(0, 6).map((e, i) => (
                  <View key={i} style={s.item}>
                    <Text style={s.time}>{e.time ?? ''}</Text>
                    <Text style={s.itemText} numberOfLines={1}>{e.label}</Text>
                    {e.kind !== 'event' && (
                      <Text style={[s.tag, e.kind === 'expiry' && { color: c.danger }, e.kind === 'birthday' && { color: '#A855F7' }]}>
                        {e.kind === 'todo' ? 'TODO' : e.kind === 'expiry' ? '期限' : '誕生日'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )
          })
        ), { flex: wide ? 1.4 : undefined }, () => router.push('/(main)/calendar' as any))}

        <View style={s.col}>
          {card(`TODO ${todos.length}件`, 'checkbox-outline', (
            todos.length === 0 ? <Text style={s.sub}>すべて完了</Text> :
            todos.slice(0, 8).map(t => {
              const late = !!t.expiration_date && t.expiration_date < today
              return (
                <Pressable key={t.id} onPress={() => completeTodo(t)} style={({ hovered }: any) => [s.item, s.tap, hovered && { backgroundColor: c.chip }]}>
                  <Ionicons name="square-outline" size={20} color={late ? c.danger : c.sub} />
                  <Text style={[s.itemText, late && { color: c.danger }]} numberOfLines={1}>{t.name}</Text>
                  <Text style={s.time}>{t.expiration_date ? (late ? `${-daysBetween(today, t.expiration_date)}日遅れ` : md(t.expiration_date)) : ''}</Text>
                </Pressable>
              )
            })
          ), undefined, () => router.push('/(main)/todo' as any))}

          {card('期限が近いもの(60日以内)', 'alarm-outline', (
            expiring.length === 0 ? <Text style={s.sub}>ありません</Text> :
            expiring.slice(0, 5).map(r => {
              const left = daysBetween(today, r.expiration_date)
              return (
                <View key={r.id} style={s.item}>
                  <Text style={s.itemText} numberOfLines={1}>{r.name}</Text>
                  <Text style={[s.time, left <= 14 && { color: c.danger, fontWeight: '700' }]}>あと{left}日</Text>
                </View>
              )
            })
          ))}
        </View>

        <View style={s.col}>
          {card(`買い物 ${shopping.length}品`, 'cart-outline', (
            shopping.length === 0 ? <Text style={s.sub}>リストは空です</Text> :
            <View style={s.chips}>
              {shopping.slice(0, 24).map(it => (
                <Pressable key={it.id} onPress={() => checkShopping(it)} style={({ hovered }: any) => [s.chip, hovered && { borderColor: c.accent }]}>
                  <Text style={s.chipText}>{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</Text>
                </Pressable>
              ))}
            </View>
          ), undefined, () => router.push('/(main)/shopping' as any))}

          {card('書類', 'document-text-outline', (
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View><Text style={s.num}>{docs.review}</Text><Text style={s.sub}>確認待ち</Text></View>
              <View><Text style={[s.num, docs.error > 0 && { color: c.danger }]}>{docs.error}</Text><Text style={s.sub}>読み取り失敗</Text></View>
            </View>
          ), undefined, () => router.push('/(main)/documents' as any))}
        </View>
      </View>
    </ScrollView>
  )
}

function makeStyles(c: ReturnType<typeof palette>, wide: boolean) {
  return StyleSheet.create({
    page: { padding: 14, gap: 12, flexGrow: 1 },
    row: { flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'stretch' },
    col: { flex: wide ? 1 : undefined, gap: 12 },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, flexGrow: 1 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    cardTitle: { fontSize: 15, color: c.sub, fontWeight: '600' },
    clockCard: { flex: wide ? 0.9 : undefined, justifyContent: 'center' },
    clock: { color: c.text, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    date: { color: c.text, fontSize: 22, fontWeight: '600', marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    meta: { color: c.sub, fontSize: 13 },
    link: { color: c.accent, fontSize: 14, fontWeight: '600' },
    weatherCard: { flex: wide ? 1.4 : undefined },
    weatherNow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    temp: { color: c.text, fontWeight: '700' },
    hours: { flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' },
    hour: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, minWidth: 56, gap: 2 },
    hourT: { color: c.sub, fontSize: 12 },
    hourV: { color: c.text, fontSize: 15, fontWeight: '600' },
    hourP: { color: c.sub, fontSize: 12 },
    garbageCard: { flex: wide ? 1.1 : undefined },
    gLabel: { color: c.sub, fontSize: 14 },
    gMain: { color: c.text, fontWeight: '800', marginVertical: 4 },
    gWeek: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
    gDay: { flex: 1, alignItems: 'center' },
    gDayV: { color: c.text, fontSize: 11, textAlign: 'center', marginTop: 2 },
    text: { color: c.text, fontSize: 16 },
    sub: { color: c.sub, fontSize: 14 },
    dayHead: { color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.border },
    tap: { borderRadius: 8, paddingHorizontal: 4 },
    time: { color: c.sub, fontSize: 13, minWidth: 40, fontVariant: ['tabular-nums'] },
    itemText: { color: c.text, fontSize: 17, flex: 1 },
    tag: { fontSize: 11, color: c.warn, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: c.border, backgroundColor: c.chip, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { color: c.text, fontSize: 17 },
    num: { color: c.text, fontSize: 34, fontWeight: '700' },
  })
}
