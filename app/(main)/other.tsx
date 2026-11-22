import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'
import { useSwitchViewMode } from '@/components/ModeSwitch'

const MENU_ITEMS = [
  {
    label: 'ダッシュボード',
    desc: '部屋のモニタ用(天気・ごみの日・予定・買い物)',
    icon: 'tv-outline' as const,
    onPress: null, // ダッシュボードモードへ切り替え(下の OtherScreen で処理)
    color: '#0EA5E9',
  },
  {
    label: 'AIの記憶',
    desc: '覚えておいてほしいことを管理',
    icon: 'brain-outline' as const,
    onPress: () => router.push('/memories' as any),
    color: '#7C3AED',
  },
  {
    label: 'よく使うページ',
    desc: 'お気に入りのサイトをすばやく開く',
    icon: 'bookmark-outline' as const,
    onPress: () => router.push('/bookmarks' as any),
    color: Colors.primary,
  },
  {
    label: '設定・バージョン情報',
    desc: '世帯設定、バージョン履歴など',
    icon: 'settings-outline' as const,
    onPress: () => router.push('/(main)/settings' as any),
    color: '#6B7280',
  },
]

export default function OtherScreen() {
  const switchMode = useSwitchViewMode()
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>その他</Text>
      </View>

      <View style={styles.list}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.row}
            onPress={item.onPress ?? (() => switchMode('dashboard'))}
            activeOpacity={0.7}
          >
            <View style={[styles.icon, { backgroundColor: tint(item.color, '18') }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowDesc}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  list: { paddingTop: Spacing.md, paddingHorizontal: Spacing.md, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
})
