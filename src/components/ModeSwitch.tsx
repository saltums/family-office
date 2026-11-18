// アプリ画面とダッシュボードを切り替えるボタン(2つ並び、今いる方に色が付く)。
// 切り替えたモードは端末に保存され、次に開いたときもそのモードで始まる。
import React, { useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useRootNavigationState } from 'expo-router'
import { Colors } from '@/lib/theme'
import { ViewMode, setViewMode, homePath } from '@/lib/viewMode'

export function useSwitchViewMode() {
  const root = useRootNavigationState()
  return useCallback((mode: ViewMode) => {
    setViewMode(mode)
    // ダッシュボードから開いた画面にいるとき(下にダッシュボードが残っている)は、
    // 新しく開かずにそこへ戻る。開き直すとダッシュボードが重なって増えていくため
    const routes: { name: string }[] = (root as any)?.routes ?? []
    if (mode === 'dashboard' && routes.length > 1 && routes[0]?.name === 'dashboard') {
      router.dismissAll()
      return
    }
    router.replace(homePath(mode) as any)
  }, [root])
}

type Palette = { bg: string; border: string; active: string; text: string }

const ITEMS: { mode: ViewMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'app', label: 'アプリ', icon: 'phone-portrait-outline' },
  { mode: 'dashboard', label: 'ダッシュボード', icon: 'tv-outline' },
]

export function ModeSwitch({ current, palette }: { current: ViewMode; palette?: Partial<Palette> }) {
  const p: Palette = { bg: Colors.card, border: Colors.border, active: Colors.primary, text: Colors.textSecondary, ...palette }
  const switchMode = useSwitchViewMode()
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg, borderColor: p.border }]} accessibilityRole="tablist">
      {ITEMS.map(it => {
        const on = it.mode === current
        return (
          <Pressable
            key={it.mode}
            onPress={() => { if (!on) switchMode(it.mode) }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${it.label}に切り替え`}
            style={[styles.seg, on && { backgroundColor: p.active }]}
          >
            <Ionicons name={it.icon} size={15} color={on ? '#fff' : p.text} />
            <Text style={[styles.label, { color: on ? '#fff' : p.text }]}>{it.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  label: { fontSize: 13, fontWeight: '700' },
})
