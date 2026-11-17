import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing } from '@/lib/theme'
import { WebMoreButton } from '@/components/WebMoreButton'

interface FamilyMember {
  id: string
  household_id: string
  name: string
  relationship: string | null
  birthday: string | null
  memo: string | null
}

interface FamilyEvent {
  id: string
  family_member_id: string
  year: number
  month: number | null
  title: string
  description: string | null
  category: string
}

const CATEGORIES = [
  { key: '教育', icon: 'school-outline', color: '#3B82F6' },
  { key: '仕事', icon: 'briefcase-outline', color: '#10B981' },
  { key: '健康', icon: 'medkit-outline', color: '#EF4444' },
  { key: '旅行', icon: 'airplane-outline', color: '#06B6D4' },
  { key: '住居', icon: 'home-outline', color: '#F59E0B' },
  { key: '記念', icon: 'gift-outline', color: '#8B5CF6' },
  { key: 'その他', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

function getCategoryStyle(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]
}

function calcAge(birthday: string): number {
  const b = new Date(birthday)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--
  return age
}

function formatBirthday(birthday: string): string {
  const [y, m, d] = birthday.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const auth = useAuthStore()

  const [member, setMember] = useState<FamilyMember | null>(null)
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [newMonth, setNewMonth] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState<CategoryKey>('その他')

  const fetchData = useCallback(async () => {
    if (!id) return
    const [memberRes, eventsRes] = await Promise.all([
      supabase.from('family_members').select('*').eq('id', id).single(),
      supabase.from('family_events').select('*').eq('family_member_id', id).order('year', { ascending: true }).order('month', { ascending: true }),
    ])
    if (memberRes.data) setMember(memberRes.data as FamilyMember)
    if (eventsRes.data) setEvents(eventsRes.data as FamilyEvent[])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  function resetForm() {
    setNewYear(String(new Date().getFullYear()))
    setNewMonth('')
    setNewTitle('')
    setNewDesc('')
    setNewCategory('その他')
  }

  async function saveEvent() {
    if (!newTitle.trim() || !id || !auth?.userId || !member) return
    setSaving(true)
    const { data, error } = await supabase
      .from('family_events')
      .insert({
        family_member_id: id,
        household_id: member.household_id,
        year: parseInt(newYear) || new Date().getFullYear(),
        month: newMonth ? parseInt(newMonth) : null,
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        category: newCategory,
        created_by: auth.userId,
      })
      .select()
      .single()
    if (!error && data) {
      setEvents(prev => [...prev, data as FamilyEvent].sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0)))
      resetForm()
      setAddModal(false)
    }
    setSaving(false)
  }

  async function deleteEvent(eventId: string) {
    Alert.alert('削除', 'このイベントを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('family_events').delete().eq('id', eventId)
          setEvents(prev => prev.filter(e => e.id !== eventId))
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

  if (!member) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={styles.errorText}>データが見つかりません</Text></View>
      </SafeAreaView>
    )
  }

  const age = member.birthday ? calcAge(member.birthday) : null

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>家族プロフィール</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={Colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{member.name}</Text>
            {member.relationship && (
              <View style={styles.relationTag}>
                <Text style={styles.relationText}>{member.relationship}</Text>
              </View>
            )}
            {member.birthday && (
              <View style={styles.birthdayRow}>
                <Ionicons name="gift-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.birthdayText}>
                  {formatBirthday(member.birthday)}
                  {age !== null ? `（${age}歳）` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>年表</Text>
          <TouchableOpacity style={styles.addEventBtn} onPress={() => setAddModal(true)}>
            <Ionicons name="add-circle" size={20} color={Colors.primary} />
            <Text style={styles.addEventText}>追加</Text>
          </TouchableOpacity>
        </View>

        {events.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Ionicons name="time-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>人生イベントを追加しましょう</Text>
            <Text style={styles.emptyHint}>入学・就職・引越しなど大切な出来事を記録</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {events.map((evt, idx) => {
              const cat = getCategoryStyle(evt.category)
              const isLast = idx === events.length - 1
              return (
                <View key={evt.id} style={styles.timelineItem}>
                  {/* Year column */}
                  <View style={styles.yearCol}>
                    <Text style={styles.yearText}>{evt.year}</Text>
                    {evt.month && <Text style={styles.monthText}>{evt.month}月</Text>}
                  </View>
                  {/* Line + dot */}
                  <View style={styles.lineCol}>
                    <View style={[styles.timelineDot, { backgroundColor: cat.color }]}>
                      <Ionicons name={cat.icon as any} size={12} color="#fff" />
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  {/* Content */}
                  <TouchableOpacity
                    style={styles.eventCard}
                    onLongPress={() => deleteEvent(evt.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.eventCardTop}>
                      <View style={[styles.categoryBadge, { backgroundColor: cat.color + '20' }]}>
                        <Text style={[styles.categoryText, { color: cat.color }]}>{evt.category}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <WebMoreButton onPress={() => deleteEvent(evt.id)} />
                    </View>
                    <Text style={styles.eventTitle}>{evt.title}</Text>
                    {evt.description ? (
                      <Text style={styles.eventDesc}>{evt.description}</Text>
                    ) : null}
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add event modal */}
      <Modal
        visible={addModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setAddModal(false); resetForm() }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setAddModal(false); resetForm() }} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>イベントを追加</Text>
              <TouchableOpacity
                onPress={saveEvent}
                disabled={!newTitle.trim() || saving}
                style={[styles.saveBtn, (!newTitle.trim() || saving) && { opacity: 0.4 }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Category picker */}
              <Text style={styles.fieldLabel}>カテゴリ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.catChip, newCategory === cat.key && { backgroundColor: cat.color + '25', borderColor: cat.color }]}
                    onPress={() => setNewCategory(cat.key as CategoryKey)}
                  >
                    <Ionicons name={cat.icon as any} size={16} color={newCategory === cat.key ? cat.color : Colors.textMuted} />
                    <Text style={[styles.catChipText, newCategory === cat.key && { color: cat.color }]}>{cat.key}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Year + Month */}
              <Text style={styles.fieldLabel}>年・月</Text>
              <View style={styles.yearMonthRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  value={newYear}
                  onChangeText={setNewYear}
                  placeholder="年（例: 2010）"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newMonth}
                  onChangeText={setNewMonth}
                  placeholder="月（任意）"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>タイトル <Text style={{ color: Colors.danger }}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="例: 小学校入学、就職、引越し"
                placeholderTextColor={Colors.placeholder}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>詳細（任意）</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="詳細メモ..."
                placeholderTextColor={Colors.placeholder}
                multiline
                numberOfLines={3}
              />
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
  errorText: { fontSize: 16, color: Colors.textMuted },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, gap: 6 },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text },
  relationTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '18',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  relationText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  birthdayText: { fontSize: 13, color: Colors.textSecondary },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  addEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addEventText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  emptyTimeline: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.md },

  timeline: { paddingHorizontal: Spacing.md, paddingBottom: 16 },
  timelineItem: { flexDirection: 'row', gap: 0, marginBottom: 0 },
  yearCol: {
    width: 52,
    paddingTop: 10,
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  yearText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  monthText: { fontSize: 11, color: Colors.textMuted },
  lineCol: { width: 28, alignItems: 'center' },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    minHeight: 20,
  },
  eventCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 12,
    marginLeft: 8,
  },
  eventCardTop: { marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryText: { fontSize: 11, fontWeight: '700' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  eventDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalBody: { flex: 1, padding: Spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  catScroll: { marginBottom: 4 },
  catScrollContent: { gap: 8, paddingBottom: 4 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  yearMonthRow: { flexDirection: 'row', gap: 10 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
})
