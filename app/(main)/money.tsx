import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { MoneyRecord } from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

type Filter = 'all' | 'received' | 'given' | 'return_pending'

function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString()}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function isReturnPending(r: MoneyRecord): boolean {
  return r.needs_return && r.return_status !== 'done'
}

export default function MoneyScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)
  const [records, setRecords] = useState<MoneyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useFocusEffect(useCallback(() => {
    if (!household) return
    setLoading(true)
    supabase
      .from('money_records')
      .select('*')
      .eq('household_id', household.id)
      .order('date', { ascending: false })
      .then(({ data }) => {
        setRecords((data as MoneyRecord[]) ?? [])
        setLoading(false)
      })
  }, [household]))

  const filtered = records.filter(r => {
    if (filter === 'received') return r.direction === 'received'
    if (filter === 'given') return r.direction === 'given'
    if (filter === 'return_pending') return isReturnPending(r)
    return true
  })

  const pendingCount = records.filter(isReturnPending).length

  // 年ごとにグループ化
  const grouped: { year: string; items: MoneyRecord[] }[] = []
  for (const r of filtered) {
    const year = r.date.slice(0, 4) + '年'
    const last = grouped[grouped.length - 1]
    if (last && last.year === year) {
      last.items.push(r)
    } else {
      grouped.push({ year, items: [r] })
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>金銭メモ</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* フィルター */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {([
          { key: 'all',            label: 'すべて' },
          { key: 'received',       label: 'もらった' },
          { key: 'given',          label: 'あげた' },
          { key: 'return_pending', label: `お返し未${pendingCount > 0 ? ` ${pendingCount}` : ''}` },
        ] as const).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💴</Text>
          <Text style={styles.emptyTitle}>記録がありません</Text>
          <Text style={styles.emptySub}>右下の＋から追加できます</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {grouped.map(({ year, items }) => (
            <View key={year}>
              <Text style={styles.yearLabel}>{year}</Text>
              <View style={styles.group}>
                {items.map((r, i) => {
                  const returnPending = isReturnPending(r)
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.row, i > 0 && styles.rowBorder]}
                      onPress={() => router.push(`/money/${r.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.dirIcon, { backgroundColor: r.direction === 'received' ? '#10B98118' : '#EF444418' }]}>
                        <Ionicons
                          name={r.direction === 'received' ? 'arrow-down' : 'arrow-up'}
                          size={16}
                          color={r.direction === 'received' ? '#10B981' : '#EF4444'}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowPerson} numberOfLines={1}>{r.person}</Text>
                          <Text style={[styles.rowAmount, { color: r.direction === 'received' ? '#10B981' : '#EF4444' }]}>
                            {r.direction === 'received' ? '+' : '-'}{formatAmount(r.amount)}
                          </Text>
                        </View>
                        <View style={styles.rowBottom}>
                          <View style={styles.eventBadge}>
                            <Text style={styles.eventBadgeText}>{r.event_type}</Text>
                          </View>
                          <Text style={styles.rowDate}>{formatDate(r.date)}</Text>
                          {returnPending && (
                            <View style={styles.returnBadge}>
                              <Text style={styles.returnBadgeText}>お返し未</Text>
                            </View>
                          )}
                          {r.needs_return && r.return_status === 'done' && (
                            <View style={styles.returnDoneBadge}>
                              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                              <Text style={styles.returnDoneBadgeText}>
                                {r.return_note ? r.return_note : 'お返し済'}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/money/new' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  filterRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 52 },
  filterContent: { gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, alignItems: 'center' },
  filterChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 5, height: 32, justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: tint(Colors.primary, '18'), borderColor: Colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  filterChipTextActive: { color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted },
  container: { padding: Spacing.md, gap: 4 },
  yearLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    marginTop: 16, marginBottom: 6, paddingLeft: 4,
  },
  group: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  dirIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowPerson: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  rowAmount: { fontSize: 15, fontWeight: '800' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventBadge: { backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  eventBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  rowDate: { fontSize: 12, color: Colors.textMuted },
  returnBadge: { backgroundColor: '#F59E0B18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  returnBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  returnDoneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#10B98118', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 120 },
  returnDoneBadgeText: { fontSize: 11, fontWeight: '600', color: '#10B981', flexShrink: 1 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
    elevation: 8,
  },
})
