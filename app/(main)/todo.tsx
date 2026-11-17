import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import {
  ExpirationRecord, TaskType, TASK_TYPES, TASK_TYPE_COLORS, TASK_TYPE_ICONS,
  daysUntilExpiration, expirationLabel, CATEGORY_COLORS,
} from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

type ListItem = ExpirationRecord & { _type: 'task' | 'expiring' }
type Filter = 'すべて' | TaskType

export default function TodoScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<Filter>('すべて')

  const fetchItems = useCallback(async () => {
    if (!household) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 30)
    const deadlineStr = deadline.toISOString().split('T')[0]

    const [tasksRes, expiringRes] = await Promise.all([
      supabase
        .from('records')
        .select('*')
        .eq('household_id', household.id)
        .eq('category', 'タスク')
        .eq('completed', false)
        .order('expiration_date', { ascending: true }),
      supabase
        .from('records')
        .select('*')
        .eq('household_id', household.id)
        .neq('category', 'タスク')
        .gte('expiration_date', today)
        .lte('expiration_date', deadlineStr)
        .order('expiration_date', { ascending: true }),
    ])

    const tasks: ListItem[] = (tasksRes.data ?? []).map((r) => ({ ...r, _type: 'task' as const }))
    const expiring: ListItem[] = (expiringRes.data ?? []).map((r) => ({ ...r, _type: 'expiring' as const }))
    const merged = [...tasks, ...expiring].sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
    setItems(merged)
    setLoading(false)
    setRefreshing(false)
  }, [household])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function toggleComplete(item: ListItem) {
    const now = new Date().toISOString()
    await supabase.from('records').update({ completed: true, completed_at: now }).eq('id', item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  const filtered = filter === 'すべて'
    ? items
    : items.filter((i) => i._type === 'task' && i.task_type === filter)

  const taskCount = items.filter((i) => i._type === 'task').length

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>TODO</Text>
          {taskCount > 0 && <Text style={styles.taskCount}>{taskCount}件のタスク</Text>}
        </View>
      </View>

      {/* フィルター */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'すべて' && styles.filterChipActive]}
          onPress={() => setFilter('すべて')}
        >
          <Text style={[styles.filterText, filter === 'すべて' && styles.filterTextActive]}>すべて</Text>
        </TouchableOpacity>
        {TASK_TYPES.map((t) => {
          const active = filter === t
          const color = TASK_TYPE_COLORS[t]
          return (
            <TouchableOpacity
              key={t}
              style={[styles.filterChip, active && { backgroundColor: color, borderColor: color }]}
              onPress={() => setFilter(t)}
            >
              <Ionicons name={TASK_TYPE_ICONS[t] as any} size={13} color={active ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{t}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchItems() }} tintColor={Colors.primary} />}
        renderItem={({ item }) => {
          const days = daysUntilExpiration(item.expiration_date)
          const isTask = item._type === 'task'
          const typeColor = isTask && item.task_type ? TASK_TYPE_COLORS[item.task_type] : CATEGORY_COLORS[item.category]
          const typeIcon = isTask && item.task_type ? TASK_TYPE_ICONS[item.task_type] : 'calendar-outline'
          const urgency = days <= 0 ? Colors.danger : days <= 7 ? '#F97316' : days <= 14 ? '#F59E0B' : Colors.textMuted

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => !isTask && router.push(`/record/${item.id}` as any)}
              activeOpacity={isTask ? 1 : 0.7}
            >
              <View style={styles.cardLeft}>
                {isTask ? (
                  <TouchableOpacity
                    style={[styles.checkbox, { borderColor: typeColor }]}
                    onPress={() => toggleComplete(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="checkmark" size={14} color={typeColor} style={{ opacity: 0 }} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLORS[item.category] }]} />
                )}
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  {isTask && item.task_type && (
                    <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
                      <Ionicons name={typeIcon as any} size={11} color={typeColor} />
                      <Text style={[styles.typeBadgeText, { color: typeColor }]}>{item.task_type}</Text>
                    </View>
                  )}
                </View>
                {item.owner && (
                  <Text style={styles.cardOwner}>{item.owner}</Text>
                )}
                <View style={styles.cardBottom}>
                  <Text style={[styles.cardDays, { color: urgency }]}>
                    {days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `${days}日後`}
                  </Text>
                  <Text style={styles.cardDate}>{item.expiration_date.replace(/-/g, '/')}</Text>
                </View>
              </View>
              {!isTask && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {filter === 'すべて' ? 'タスクも期限切れ間近の項目もありません' : `「${filter}」のタスクはありません`}
            </Text>
          </View>
        }
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/record/new?defaultCategory=タスク' as any)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 8,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  taskCount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: Spacing.md, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: '#fff' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md, marginBottom: 8,
    borderRadius: Radius.lg, padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    gap: 12,
  },
  cardLeft: { alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  cardOwner: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDays: { fontSize: 13, fontWeight: '700' },
  cardDate: { fontSize: 12, color: Colors.textMuted },
  list: { paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  fab: {
    position: 'absolute', right: 24, bottom: 32,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
})
