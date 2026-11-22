// デザイントークン: 柔らかく見やすいスマホUI
//
// ダークモード(Web版のみ): 22:00〜6:00 は自動でダークになる。
// Web では Colors の値を CSS変数(var(--fo-xxx))にしてあり、時間帯で変数の中身だけを入れ替える。
// 画面は作り直し(再描画)をしなくても色が変わる。スマホアプリは従来どおりの固定色。
import { Platform } from 'react-native'

const LIGHT = {
  primary: '#4F8EF7',       // 柔らかいブルー
  primaryLight: '#EBF2FF',
  danger: '#F87171',
  dangerLight: '#FEF2F2',
  warning: '#FBBF24',
  warningLight: '#FFFBEB',
  warningText: '#92400E',   // 警告ボックスの文字
  success: '#34D399',
  successLight: '#ECFDF5',
  successSoft: '#D1FAE5',   // 成功バナーの背景(successLight より濃い)
  successText: '#065F46',   // 成功バナーの文字

  bg: '#F7F8FC',            // 温かみのある薄いグレー
  card: '#FFFFFF',
  surface: '#F3F4F6',       // カードの上に重ねる薄い面(チップ・ボタンの地)
  border: '#E5E7EB',
  borderFocus: '#4F8EF7',

  text: '#1F2937',          // ほぼ黒
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  placeholder: '#BFC6D0',
}

type ColorKey = keyof typeof LIGHT

const DARK: Record<ColorKey, string> = {
  primary: '#4F8EF7', // 明るくすると青いボタンの白文字が読みにくくなるので、ライトと同じ青のまま
  primaryLight: '#1E2B47',
  danger: '#F87171',
  dangerLight: '#3B2026',
  warning: '#FBBF24',
  warningLight: '#3A3118',
  warningText: '#FCD34D',
  success: '#34D399',
  successLight: '#10322A',
  successSoft: '#14382D',
  successText: '#6EE7B7',

  bg: '#0F172A',
  card: '#1E293B',
  surface: '#2A3850',
  border: '#334155',
  borderFocus: '#4F8EF7',

  text: '#F1F5F9',
  textSecondary: '#A9B4C6',
  textMuted: '#7D8BA2',
  placeholder: '#5B6980',
}

const IS_WEB = Platform.OS === 'web'

export const Colors: typeof LIGHT = IS_WEB
  ? (Object.fromEntries(Object.keys(LIGHT).map(k => [k, `var(--fo-${k})`])) as typeof LIGHT)
  : LIGHT

// ---------- 時間帯 ----------
export const DARK_FROM_HOUR = 22 // 22:00 から
export const DARK_TO_HOUR = 6    // 6:00 まで
export function isDarkTime(d: Date = new Date()): boolean {
  const h = d.getHours()
  return h >= DARK_FROM_HOUR || h < DARK_TO_HOUR
}

// ---------- 透明度つきの色 ----------
// 'Colors.primary + "18"' のような「色の文字列に透明度を足す書き方」は CSS変数では使えないので、これを使う。
// aa は 16進2桁の透明度('18' など)。使える透明度は ALPHAS に挙げたものだけ。
const ALPHAS = ['12', '15', '18', '20', '22', '25', '44', '66']
const ALPHA_KEYS: ColorKey[] = ['primary', 'danger', 'warning', 'success']
export function tint(color: string, aa: string): string {
  if (IS_WEB) {
    const m = /^var\(--fo-(\w+)\)$/.exec(color)
    if (m) return `var(--fo-${m[1]}-${aa})`
  }
  return color + aa
}

// ---------- Web: CSS変数の登録と、時間帯による切り替え ----------
function rgba(hex: string, aa: string) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${(parseInt(aa, 16) / 255).toFixed(3)})`
}
function vars(p: Record<ColorKey, string>) {
  const lines: string[] = []
  for (const k of Object.keys(p) as ColorKey[]) lines.push(`--fo-${k}:${p[k]};`)
  for (const k of ALPHA_KEYS) for (const a of ALPHAS) lines.push(`--fo-${k}-${a}:${rgba(p[k], a)};`)
  return lines.join('')
}

if (IS_WEB && typeof document !== 'undefined') {
  const el = document.createElement('style')
  el.id = 'fo-theme'
  el.textContent =
    `:root{${vars(LIGHT)}color-scheme:light}` +
    `:root[data-theme="dark"]{${vars(DARK)}color-scheme:dark}` +
    `html,body{background-color:var(--fo-bg)}`
  document.head.appendChild(el)

  const meta = document.querySelector('meta[name="theme-color"]') ?? (() => {
    const m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); return m
  })()
  const apply = () => {
    const dark = isDarkTime()
    const theme = dark ? 'dark' : 'light'
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme
      meta.setAttribute('content', dark ? DARK.bg : LIGHT.bg)
    }
  }
  apply()
  setInterval(apply, 30 * 1000)
  document.addEventListener('visibilitychange', apply)
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
}

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
}

export const Font = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
}

// 最低タップ領域 (Apple HIG: 44pt)
export const MIN_TAP = 44
