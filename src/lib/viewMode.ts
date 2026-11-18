// 表示モード: ふつうのアプリ画面 / 部屋のモニタ用ダッシュボード。
// 端末ごとに覚えておき、次に開いたときも同じモードで始める。
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ViewMode = 'app' | 'dashboard'

const KEY = 'fo_view_mode'
let current: ViewMode | null = null

export async function loadViewMode(): Promise<ViewMode> {
  if (current) return current
  try {
    current = (await AsyncStorage.getItem(KEY)) === 'dashboard' ? 'dashboard' : 'app'
  } catch {
    current = 'app'
  }
  return current
}

export function getViewMode(): ViewMode {
  return current ?? 'app'
}

export function setViewMode(mode: ViewMode) {
  if (current === mode) return
  current = mode
  AsyncStorage.setItem(KEY, mode).catch(() => {})
}

// そのモードの最初の画面
export function homePath(mode: ViewMode = getViewMode()): string {
  return mode === 'dashboard' ? '/dashboard' : '/(main)/'
}
