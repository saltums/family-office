import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'
import { WebMoreButton } from '@/components/WebMoreButton'

// 8桁入力 → YYYY-MM-DD に正規化
function normalizeDate(input: string): string {
  const clean = input.replace(/[-/]/g, '')
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
  }
  return input
}

// YYYY-MM-DD → 入力欄用 YYYYMMDD（ハイフンなし）
function toDateInput(stored: string): string {
  return stored.replace(/-/g, '')
}

// YYYY-MM-DD → 和暦 + 西暦
function formatWareki(dateStr: string): string {
  if (!dateStr) return ''
  const normalized = normalizeDate(dateStr)
  const parts = normalized.split('-')
  if (parts.length !== 3) return dateStr
  const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2])
  const num = y * 10000 + m * 100 + d

  let era = '', startYear = 0
  if (num >= 20190501)      { era = '令和'; startYear = 2019 }
  else if (num >= 19890108) { era = '平成'; startYear = 1989 }
  else if (num >= 19261225) { era = '昭和'; startYear = 1926 }
  else if (num >= 19120730) { era = '大正'; startYear = 1912 }
  else if (num >= 18680908) { era = '明治'; startYear = 1868 }
  else return `${y}年${m}月${d}日`

  const eraYear = y - startYear + 1
  const eraLabel = eraYear === 1 ? '元' : String(eraYear)
  return `${era}${eraLabel}年${m}月${d}日（${y}年）`
}

export interface KnowledgeItem {
  id: string
  household_id: string
  title: string
  content: string
  category: string
  source: string
  metadata: Record<string, string>
  updated_at: string
}

const CATEGORIES = [
  { id: 'all',    label: 'すべて' },
  { id: 'person', label: '人物' },
  { id: 'place',  label: '場所' },
  { id: 'event',  label: '出来事' },
  { id: 'other',  label: 'その他' },
]

// カテゴリ別のメタデータフィールド定義
const META_FIELDS: Record<string, { key: string; label: string; placeholder: string; type?: 'date' | 'select'; options?: string[] }[]> = {
  person: [
    { key: 'birth_date', label: '生年月日', placeholder: '例: 19901220', type: 'date' },
    { key: 'relationship', label: '関係', placeholder: '例: 友人・家族・同僚・取引先', type: 'select', options: ['家族', '友人', '同僚', '取引先', 'その他'] },
  ],
  place: [
    { key: 'address', label: '住所', placeholder: '例: 東京都渋谷区…' },
    { key: 'nearest_station', label: '最寄駅', placeholder: '例: 渋谷駅' },
  ],
  event: [
    { key: 'event_date', label: '日付', placeholder: '例: 20260906', type: 'date' },
    { key: 'location', label: '場所', placeholder: '例: 東京・オンライン' },
  ],
  other: [],
}

export default function KnowledgeScreen() {
  const auth = useAuthStore()
  const householdId = auth?.householdId ?? null

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [kTitle, setKTitle] = useState('')
  const [kContent, setKContent] = useState('')
  const [kCategory, setKCategory] = useState('other')
  const [kMeta, setKMeta] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('household_id', householdId)
      .order('updated_at', { ascending: false })
    if (data) setItems(data as KnowledgeItem[])
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const filtered = items.filter(item => {
    const matchCat = filterCategory === 'all' || item.category === filterCategory
    const matchSearch = !search.trim() ||
      item.title.includes(search) || item.content.includes(search)
    return matchCat && matchSearch
  })

  function openNew() {
    setEditing(null); setKTitle(''); setKContent(''); setKCategory('other'); setKMeta({})
    setShowModal(true)
  }

  function openEdit(item: KnowledgeItem) {
    setEditing(item)
    setKTitle(item.title)
    setKContent(item.content)
    setKCategory(item.category)
    // 日付フィールドはハイフンなし8桁で表示
    const rawMeta = item.metadata ?? {}
    const displayMeta: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawMeta)) {
      displayMeta[k] = (k === 'birth_date' || k === 'event_date') ? toDateInput(v) : v
    }
    setKMeta(displayMeta)
    setShowModal(true)
  }

  function changeCategory(cat: string) {
    setKCategory(cat)
    setKMeta({})
  }

  function setMetaField(key: string, value: string) {
    setKMeta(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!kTitle.trim() || !kContent.trim() || !householdId) return
    setSaving(true)
    // 日付フィールドを YYYY-MM-DD に正規化して保存
    const normalizedMeta: Record<string, string> = {}
    for (const [k, v] of Object.entries(kMeta)) {
      normalizedMeta[k] = (k === 'birth_date' || k === 'event_date') ? normalizeDate(v) : v
    }
    const payload = {
      title: kTitle.trim(),
      content: kContent.trim(),
      category: kCategory,
      metadata: normalizedMeta,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { data } = await supabase
        .from('knowledge_items')
        .update(payload)
        .eq('id', editing.id)
        .select().single()
      if (data) setItems(prev => prev.map(k => k.id === editing.id ? data as KnowledgeItem : k))
    } else {
      const { data } = await supabase
        .from('knowledge_items')
        .insert({ household_id: householdId, source: 'manual', ...payload })
        .select().single()
      if (data) setItems(prev => [data as KnowledgeItem, ...prev])
    }
    setSaving(false)
    setShowModal(false)
  }

  function confirmDelete(item: { id: string; title: string }) {
    Alert.alert(item.title, '削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => deleteItem(item.id) },
    ], { cancelable: true })
  }

  async function deleteItem(id: string) {
    await supabase.from('knowledge_items').delete().eq('id', id)
    setItems(prev => prev.filter(k => k.id !== id))
  }

  const catLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label ?? 'その他'

  function renderMetaSummary(item: KnowledgeItem) {
    const fields = META_FIELDS[item.category] ?? []
    const entries = fields
      .map(f => {
        const val = item.metadata?.[f.key]
        if (!val) return null
        const display = (f.key === 'birth_date' || f.key === 'event_date') ? formatWareki(val) : val
        return `${f.label}: ${display}`
      })
      .filter(Boolean)
    if (entries.length === 0) return null
    return (
      <View style={styles.metaRow}>
        {entries.map((e, i) => (
          <Text key={i} style={styles.metaChip}>{e}</Text>
        ))}
      </View>
    )
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
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>知識ベース</Text>
        <Text style={styles.count}>{items.length}件</Text>
      </View>

      {/* 検索 */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="検索..."
          placeholderTextColor={Colors.placeholder}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* カテゴリフィルタ */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.filterChip, filterCategory === cat.id && styles.filterChipActive]}
              onPress={() => setFilterCategory(cat.id)}
            >
              <Text style={[styles.filterChipText, filterCategory === cat.id && styles.filterChipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* リスト */}
      <FlatList
        data={filtered}
        keyExtractor={k => k.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => openEdit(item)}
            onLongPress={() => confirmDelete(item)}
            activeOpacity={0.75}
          >
            <View style={styles.itemMeta}>
              <View style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{catLabel(item.category)}</Text>
              </View>
              {item.source === 'diary_extracted' && (
                <View style={styles.sourceBadge}>
                  <Ionicons name="book-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.sourceBadgeText}>日記から</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <WebMoreButton onPress={() => confirmDelete(item)} />
            </View>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {renderMetaSummary(item)}
            <Text style={styles.itemContent} numberOfLines={3}>{item.content}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="library-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {search ? '検索結果なし' : '知識がまだありません'}
            </Text>
            <Text style={styles.emptyHint}>日記を書くと自動で蓄積されます</Text>
          </View>
        }
        contentContainerStyle={[styles.list, filtered.length === 0 && { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      />

      {/* 追加FAB */}
      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* 追加・編集モーダル */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editing ? '知識を編集' : '知識を追加'}</Text>
            <TouchableOpacity
              onPress={save}
              disabled={!kTitle.trim() || !kContent.trim() || saving}
              style={[styles.saveBtn, (!kTitle.trim() || !kContent.trim()) && { opacity: 0.4 }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* カテゴリ選択（先に選ぶ） */}
            <Text style={styles.fieldLabel}>カテゴリ</Text>
            <View style={styles.catRow}>
              {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, kCategory === cat.id && styles.catChipActive]}
                  onPress={() => changeCategory(cat.id)}
                >
                  <Text style={[styles.catChipText, kCategory === cat.id && styles.catChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>タイトル（人名・場所など）</Text>
            <TextInput
              style={styles.fieldInput}
              value={kTitle}
              onChangeText={setKTitle}
              placeholder="例：田中さん、近所のスーパー"
              placeholderTextColor={Colors.placeholder}
              autoFocus={!editing}
            />

            {/* カテゴリ別フィールド */}
            {(META_FIELDS[kCategory] ?? []).map(field => (
              <View key={field.key}>
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{field.label}</Text>
                {field.type === 'select' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {(field.options ?? []).map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionChip, kMeta[field.key] === opt && styles.optionChipActive]}
                        onPress={() => setMetaField(field.key, opt)}
                      >
                        <Text style={[styles.optionChipText, kMeta[field.key] === opt && styles.optionChipTextActive]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <TextInput
                    style={styles.fieldInput}
                    value={kMeta[field.key] ?? ''}
                    onChangeText={v => setMetaField(field.key, v)}
                    placeholder={field.placeholder}
                    placeholderTextColor={Colors.placeholder}
                    keyboardType={field.type === 'date' ? 'number-pad' : 'default'}
                    maxLength={field.type === 'date' ? 8 : undefined}
                  />
                )}
              </View>
            ))}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>メモ・詳細</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextarea]}
              value={kContent}
              onChangeText={setKContent}
              placeholder="例：大学の同期。先月転職した。好きな食べ物はラーメン。"
              placeholderTextColor={Colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.text },
  count: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.md, marginTop: 12,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  filterBar: { marginTop: 10 },
  filterContent: { paddingHorizontal: Spacing.md, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg,
  },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  list: { padding: Spacing.md, gap: 1 },
  item: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  catBadge: { backgroundColor: tint(Colors.primary, '18'), borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sourceBadgeText: { fontSize: 11, color: Colors.textMuted },
  itemTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  metaChip: { fontSize: 11, color: Colors.textSecondary, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  itemContent: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted },
  fab: {
    position: 'absolute', right: 20, bottom: 32,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  modalNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBody: { padding: Spacing.md, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text,
  },
  fieldTextarea: { minHeight: 120 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg },
  catChipActive: { borderColor: Colors.primary, backgroundColor: tint(Colors.primary, '15') },
  catChipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  catChipTextActive: { color: Colors.primary },
  optionChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg },
  optionChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  optionChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  optionChipTextActive: { color: '#fff' },
})
