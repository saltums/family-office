import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

type EventType = 'todo' | 'expiry' | 'birthday' | 'knowledge_event'

interface CalEvent {
  date: string // YYYY-MM-DD
  type: EventType
  label: string
  id: string
}

interface FamilyMember {
  id: string
  household_id: string
  name: string
  relationship: string | null
  birthday: string | null // YYYY-MM-DD
  memo: string | null
  created_by: string
}

const EVENT_COLORS: Record<EventType, string> = {
  todo: '#3B82F6',
  expiry: '#F59E0B',
  birthday: '#8B5CF6',
  knowledge_event: '#10B981',
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  todo: 'TODO',
  expiry: '期限',
  birthday: '誕生日',
  knowledge_event: '出来事',
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)
  return days
}

export default function CalendarScreen() {
  const auth = useAuthStore()
  const householdId = auth?.householdId ?? null

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(
    toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  )
  const [records, setRecords] = useState<any[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [knowledgeItems, setKnowledgeItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [familyModal, setFamilyModal] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRelationship, setNewRelationship] = useState('旦那')
  const [newBirthday, setNewBirthday] = useState('')

  const fetchData = useCallback(async () => {
    if (!householdId) { setLoading(false); return }
    const [recordsRes, membersRes, knowledgeRes] = await Promise.all([
      supabase
        .from('records')
        .select('id, name, category, expiration_date, completed')
        .eq('household_id', householdId),
      supabase
        .from('family_members')
        .select('*')
        .eq('household_id', householdId),
      supabase
        .from('knowledge_items')
        .select('id, title, category, metadata')
        .eq('household_id', householdId)
        .in('category', ['person', 'event']),
    ])
    if (recordsRes.data) setRecords(recordsRes.data)
    if (membersRes.data) setFamilyMembers(membersRes.data as FamilyMember[])
    if (knowledgeRes.data) setKnowledgeItems(knowledgeRes.data)
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchData() }, [fetchData])

  // Compute calendar events from records + birthdays + knowledge base
  const events = useMemo<CalEvent[]>(() => {
    const evts: CalEvent[] = []
    for (const r of records) {
      if (!r.expiration_date) continue
      if (r.category === 'タスク') {
        if (!r.completed) evts.push({ date: r.expiration_date, type: 'todo', label: r.name, id: r.id })
      } else {
        evts.push({ date: r.expiration_date, type: 'expiry', label: r.name, id: r.id })
      }
    }
    // family_members の誕生日（毎年）
    for (const m of familyMembers) {
      if (!m.birthday) continue
      const [, bm, bd] = m.birthday.split('-')
      evts.push({ date: `${year}-${bm}-${bd}`, type: 'birthday', label: `${m.name}の誕生日`, id: m.id })
    }
    // 知識ベース: 人物の誕生日（毎年）
    for (const k of knowledgeItems) {
      if (k.category === 'person' && k.metadata?.birth_date) {
        const parts = k.metadata.birth_date.split('-')
        if (parts.length >= 3) {
          const bm = parts[1], bd = parts[2]
          evts.push({ date: `${year}-${bm}-${bd}`, type: 'birthday', label: `${k.title}の誕生日`, id: k.id })
        }
      }
      // 知識ベース: 出来事（一度だけの日付）
      if (k.category === 'event' && k.metadata?.event_date) {
        evts.push({ date: k.metadata.event_date, type: 'knowledge_event', label: k.title, id: k.id })
      }
    }
    return evts
  }, [records, familyMembers, knowledgeItems, year])

  const eventMap = useMemo(() => {
    const map: Record<string, EventType[]> = {}
    for (const e of events) {
      if (!map[e.date]) map[e.date] = []
      if (!map[e.date].includes(e.type)) map[e.date].push(e.type)
    }
    return map
  }, [events])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDay(toDateStr(today.getFullYear(), today.getMonth(), today.getDate()))
  }

  const days = getCalendarDays(year, month)
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedEvents = selectedDay ? events.filter(e => e.date === selectedDay) : []

  async function addFamilyMember() {
    if (!newName.trim() || !auth?.userId || !householdId) return
    setAddingMember(true)
    const birthday = newBirthday.trim() || null
    const { data, error } = await supabase
      .from('family_members')
      .insert({
        household_id: householdId,
        name: newName.trim(),
        relationship: newRelationship.trim() || null,
        birthday,
        created_by: auth.userId,
      })
      .select()
      .single()
    if (!error && data) {
      setFamilyMembers(prev => [...prev, data as FamilyMember])
      setNewName('')
      setNewRelationship('')
      setNewBirthday('')
    }
    setAddingMember(false)
  }

  async function deleteFamilyMember(id: string) {
    Alert.alert('削除', 'この家族情報を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('family_members').delete().eq('id', id)
          setFamilyMembers(prev => prev.filter(m => m.id !== id))
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Month navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.monthTitle}>{year}年{month + 1}月</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFamilyModal(true)} style={styles.familyIconBtn} hitSlop={8}>
          <Ionicons name="people-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {(['todo', 'expiry', 'birthday', 'knowledge_event'] as EventType[]).map(type => (
          <View key={type} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: EVENT_COLORS[type] }]} />
            <Text style={styles.legendText}>{EVENT_TYPE_LABELS[type]}</Text>
          </View>
        ))}
      </View>

      {/* Weekday headers */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={d} style={[styles.weekDay, i === 0 && styles.sunday, i === 6 && styles.saturday]}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {days.map((day, idx) => {
          if (day === null) return <View key={`e${idx}`} style={styles.cell} />
          const dateStr = toDateStr(year, month, day)
          const dotTypes = eventMap[dateStr]
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDay
          const col = idx % 7
          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.cell, isSelected && !isToday && styles.cellSelected]}
              onPress={() => setSelectedDay(isSelected ? null : dateStr)}
              activeOpacity={0.7}
            >
              <View style={[styles.dayCircle, isToday && styles.todayCircle]}>
                <Text style={[
                  styles.dayText,
                  col === 0 && styles.sundayText,
                  col === 6 && styles.saturdayText,
                  isToday && styles.todayText,
                ]}>{day}</Text>
              </View>
              <View style={styles.dotsRow}>
                {dotTypes?.map(t => (
                  <View key={t} style={[styles.dot, { backgroundColor: EVENT_COLORS[t] }]} />
                ))}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Events for selected date */}
      <View style={styles.eventsSection}>
        {selectedDay ? (
          <>
            <Text style={styles.eventsDateLabel}>
              {month + 1}月{parseInt(selectedDay.split('-')[2])}日
            </Text>
            {selectedEvents.length === 0 ? (
              <Text style={styles.noEvents}>予定なし</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedEvents.map((item, i) => (
                  <View key={`${item.id}-${i}`} style={styles.eventRow}>
                    <View style={[styles.eventTag, { backgroundColor: tint(EVENT_COLORS[item.type], '20') }]}>
                      <View style={[styles.eventTagDot, { backgroundColor: EVENT_COLORS[item.type] }]} />
                      <Text style={[styles.eventTagText, { color: EVENT_COLORS[item.type] }]}>
                        {EVENT_TYPE_LABELS[item.type]}
                      </Text>
                    </View>
                    <Text style={styles.eventLabel} numberOfLines={1}>{item.label}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <Text style={styles.noEvents}>日付をタップして予定を確認</Text>
        )}
      </View>

      {/* Family members modal */}
      <Modal
        visible={familyModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFamilyModal(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>家族プロフィール</Text>
              <TouchableOpacity onPress={() => setFamilyModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {familyMembers.length === 0 && (
                <Text style={styles.emptyText}>まだ登録がありません</Text>
              )}
              {familyMembers.map(m => (
                <View key={m.id} style={styles.memberRow}>
                  <View style={styles.memberIcon}>
                    <Ionicons name="person-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{m.name}{m.relationship ? `（${m.relationship}）` : ''}</Text>
                    {m.birthday
                      ? <Text style={styles.memberMeta}>誕生日: {m.birthday}</Text>
                      : null}
                  </View>
                  <TouchableOpacity onPress={() => deleteFamilyMember(m.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.addSection}>
                <Text style={styles.addSectionTitle}>追加</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="名前（例: りな）"
                  placeholderTextColor={Colors.placeholder}
                />
                <Text style={[styles.addSectionTitle, { marginTop: 8, marginBottom: 4, fontSize: 12 }]}>続柄</Text>
                <View style={styles.roleRow}>
                  {(['旦那', '妻', '子ども', '祖父', '祖母'] as const).map(role => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleChip, newRelationship === role && styles.roleChipActive]}
                      onPress={() => setNewRelationship(role)}
                    >
                      <Text style={[styles.roleChipText, newRelationship === role && styles.roleChipTextActive]}>{role}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.modalInput, { marginTop: 8 }]}
                  value={newBirthday}
                  onChangeText={setNewBirthday}
                  placeholder="誕生日（任意: 1985-03-15）"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  style={[styles.addBtn, (!newName.trim() || addingMember) && { opacity: 0.4 }]}
                  onPress={addFamilyMember}
                  disabled={!newName.trim() || addingMember}
                >
                  {addingMember
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.addBtnText}>追加</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  monthTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  familyIconBtn: { marginLeft: 12 },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 6,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  weekRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  sunday: { color: '#EF4444' },
  saturday: { color: '#3B82F6' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.2857%',
    minHeight: 54,
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cellSelected: { backgroundColor: tint(Colors.primary, '12') },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircle: { backgroundColor: Colors.primary },
  dayText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  sundayText: { color: '#EF4444' },
  saturdayText: { color: '#3B82F6' },
  todayText: { color: '#fff' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2, minHeight: 8 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  eventsSection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    backgroundColor: Colors.bg,
  },
  eventsDateLabel: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  noEvents: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 20 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  eventTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  eventTagDot: { width: 6, height: 6, borderRadius: 3 },
  eventTagText: { fontSize: 11, fontWeight: '700' },
  eventLabel: { flex: 1, fontSize: 14, color: Colors.text },

  // Family modal
  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalBody: { flex: 1, paddingHorizontal: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  memberIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tint(Colors.primary, '18'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  memberMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  addSection: { paddingVertical: 20, gap: 10 },
  addSectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  modalInput: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  roleChipActive: { borderColor: Colors.primary, backgroundColor: tint(Colors.primary, '18') },
  roleChipText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  roleChipTextActive: { color: Colors.primary },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
