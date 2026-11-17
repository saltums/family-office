import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { Colors, Radius, Spacing } from '@/lib/theme'

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  color: string
  route: string
}

const MENU_ITEMS: MenuItem[] = [
  { icon: 'calendar-outline',         label: 'カレンダー', color: '#8B5CF6', route: '/(main)/calendar' },
  { icon: 'checkmark-circle-outline', label: 'TODO',       color: '#F97316', route: '/(main)/todo'     },
  { icon: 'book-outline',             label: '日記',       color: '#10B981', route: '/(main)/diary'    },
  { icon: 'cart-outline',             label: '買い物',     color: '#06B6D4', route: '/(main)/shopping' },
  { icon: 'restaurant-outline',       label: '料理',       color: '#F43F5E', route: '/(main)/recipes'  },
  { icon: 'folder-outline',           label: '管理',       color: Colors.primary, route: '/(main)/records' },
  { icon: 'document-text-outline',   label: '書類',       color: '#0EA5E9', route: '/(main)/documents' },
  { icon: 'apps-outline',             label: 'その他',     color: '#6B7280', route: '/(main)/other'    },
]

export default function HomeScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.appName}>Family Office</Text>
          {household?.name && (
            <View style={styles.householdBadge}>
              <Ionicons name="home-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.householdName}>{household.name}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>メニュー</Text>

        <View style={styles.grid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.gridCell}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={30} color={item.color} />
              </View>
              <Text style={styles.cellLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.md, paddingBottom: 80 },
  header: { marginBottom: Spacing.xl },
  appName: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  householdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  householdName: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCell: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  iconCircle: {
    width: 60, height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
})
