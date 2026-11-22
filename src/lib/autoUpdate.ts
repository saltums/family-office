// ダッシュボード(部屋のモニタ)を出しっぱなしにしても古くならないための自動更新。Web 版だけ。
//  - 新しい版が公開されていたら、次の確認のときに自動で読み込み直す
//  - 夜中に1回、読み込み直す(出しっぱなしで重くなるのを防ぐ)
// 入力途中の画面を消さないよう、ダッシュボードを開いているときだけ動かす。
import { useEffect } from 'react'
import { Platform } from 'react-native'

export const VERSION_CHECK_MS = 10 * 60 * 1000 // 新しい版の確認: 10分ごと
const NIGHTLY_HOUR = 3                          // 夜中の読み込み直し: 3時台
const MIN_UPTIME_MS = 6 * 3600 * 1000           // 開いてから6時間以上たっているときだけ

const ENTRY = /_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/

export function useAutoUpdate(enabled: boolean = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return
    const startedAt = Date.now()
    const script = document.querySelector('script[src*="_expo/static/js/web/entry-"]') as HTMLScriptElement | null
    const running = script ? script.src.match(ENTRY)?.[0] ?? null : null
    const base = script ? script.src.split('_expo/')[0] : null

    const check = async () => {
      try {
        if (new Date().getHours() === NIGHTLY_HOUR && Date.now() - startedAt > MIN_UPTIME_MS) {
          location.reload()
          return
        }
        if (!running || !base) return
        const res = await fetch(`${base}index.html?v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = (await res.text()).match(ENTRY)?.[0]
        if (latest && latest !== running) location.reload()
      } catch {
        // 通信できないときは何もしない(次の確認でやり直す)
      }
    }
    const t = setInterval(check, VERSION_CHECK_MS)
    return () => clearInterval(t)
  }, [enabled])
}
