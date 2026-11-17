import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing } from '@/lib/theme'
import { WebMoreButton } from '@/components/WebMoreButton'

const CATEGORIES = [
  { id: 'food',   label: '食材',   emoji: '🥦' },
  { id: 'drink',  label: '飲み物', emoji: '🥤' },
  { id: 'daily',  label: '日用品', emoji: '🧴' },
  { id: 'health', label: '薬・衛生', emoji: '💊' },
  { id: 'other',  label: 'その他', emoji: '📦' },
] as const

type CategoryId = typeof CATEGORIES[number]['id']
type FilterId = CategoryId | 'all'

interface ShoppingItem {
  id: string
  household_id: string
  name: string
  checked: boolean
  checked_at: string | null
  category: CategoryId | null
  quantity: number
  created_by: string
  created_at: string
}

function formatLastBought(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `前回: ${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`
}

function getCategoryInfo(id: CategoryId | null) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

type ListRow =
  | { type: 'header'; categoryId: CategoryId; label: string; emoji: string }
  | { type: 'item'; item: ShoppingItem }

function buildRows(items: ShoppingItem[], filter: FilterId): ListRow[] {
  const rows: ListRow[] = []
  const cats = filter === 'all' ? CATEGORIES : CATEGORIES.filter(c => c.id === filter)
  const grouped = new Map<string, ShoppingItem[]>()
  for (const cat of CATEGORIES) grouped.set(cat.id, [])

  for (const item of items) {
    const key = item.category ?? 'other'
    grouped.get(key)?.push(item)
  }

  for (const cat of cats) {
    const catItems = grouped.get(cat.id) ?? []
    if (catItems.length === 0) continue
    rows.push({ type: 'header', categoryId: cat.id, label: cat.label, emoji: cat.emoji })
    const unchecked = catItems.filter(i => !i.checked)
    const checked = catItems.filter(i => i.checked)
    for (const item of [...unchecked, ...checked]) {
      rows.push({ type: 'item', item })
    }
  }

  return rows
}

export default function ShoppingScreen() {
  const auth = useAuthStore()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('food')
  const [filter, setFilter] = useState<FilterId>('all')
  const [quantity, setQuantity] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<TextInput>(null)

  const householdId = auth?.householdId ?? null

  const fetchItems = useCallback(async () => {
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true })
    if (data) setItems(data as ShoppingItem[])
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    if (!householdId) return
    const channel = supabase
      .channel(`shopping:${householdId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shopping_items',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, fetchItems])

  async function addItem() {
    const name = input.trim()
    if (!name || !auth?.userId || !householdId) return
    setAdding(true)
    const { data } = await supabase
      .from('shopping_items')
      .insert({ household_id: householdId, name, created_by: auth.userId, category: selectedCategory, quantity })
      .select()
      .single()
    if (data) setItems(prev => [...prev, data as ShoppingItem])
    setInput('')
    setQuantity(1)
    setAdding(false)
    inputRef.current?.focus()
  }

  async function toggleItem(item: ShoppingItem) {
    const checked = !item.checked
    if (checked) {
      const checked_at = new Date().toISOString()
      await supabase.from('shopping_items').update({ checked, checked_at }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked, checked_at } : i))
    } else {
      // チェックを外すだけ、checked_at（前回購入日）は保持
      await supabase.from('shopping_items').update({ checked: false }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: false } : i))
    }
  }

  async function deleteItem(id: string) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function startEdit(item: ShoppingItem) {
    setEditingId(item.id)
    setEditingName(item.name)
  }

  async function commitEdit(item: ShoppingItem) {
    const name = editingName.trim()
    setEditingId(null)
    if (!name || name === item.name) return
    await supabase.from('shopping_items').update({ name }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, name } : i))
  }

  function openItemMenu(item: any) {
    Alert.alert(item.name, undefined, [
      { text: '名前を変更', onPress: () => startEdit(item) },
      { text: 'カテゴリを変更', onPress: () => changeCategory(item) },
      { text: 'リストから削除', style: 'destructive', onPress: () => deleteItem(item.id) },
      { text: 'キャンセル', style: 'cancel' },
    ], { cancelable: true })
  }

  async function changeCategory(item: ShoppingItem) {
    Alert.alert('カテゴリを変更', item.name,
      [
        ...CATEGORIES.map(cat => ({
          text: `${cat.emoji} ${cat.label}${item.category === cat.id ? ' ✓' : ''}`,
          onPress: async () => {
            await supabase.from('shopping_items').update({ category: cat.id }).eq('id', item.id)
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, category: cat.id } : i))
          },
        })),
        { text: 'キャンセル' },
      ],
      { cancelable: true }
    )
  }

  async function resetAll() {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    if (checkedIds.length === 0) return
    // checked_at は保持（前回購入日として表示するため）
    await supabase.from('shopping_items').update({ checked: false }).in('id', checkedIds)
    setItems(prev => prev.map(i => i.checked ? { ...i, checked: false } : i))
  }

  const rows = buildRows(items, filter)
  const checkedCount = items.filter(i => i.checked).length

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'android' ? 80 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>買い物リスト</Text>
          {checkedCount > 0 && (
            <TouchableOpacity onPress={resetAll} style={styles.resetBtn}>
              <Ionicons name="refresh" size={15} color={Colors.primary} />
              <Text style={styles.resetBtnText}>リセット ({checkedCount})</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row, i) =>
            row.type === 'item' ? row.item.id : `hdr-${row.categoryId}-${i}`
          }
          renderItem={({ item: row }) => {
            if (row.type === 'header') {
              return (
                <View style={styles.catHeader}>
                  <Text style={styles.catEmoji}>{row.emoji}</Text>
                  <Text style={styles.catLabel}>{row.label}</Text>
                </View>
              )
            }
            const { item } = row
            return (
              <TouchableOpacity
                style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                onPress={() => toggleItem(item)}
                onLongPress={() => openItemMenu(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                  {item.checked && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  {editingId === item.id ? (
                    <TextInput
                      style={styles.editInput}
                      value={editingName}
                      onChangeText={setEditingName}
                      onBlur={() => commitEdit(item)}
                      onSubmitEditing={() => commitEdit(item)}
                      autoFocus
                      returnKeyType="done"
                    />
                  ) : (
                    <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                      {item.name}
                      {item.quantity > 1 && (
                        <Text style={styles.itemQty}> ×{item.quantity}</Text>
                      )}
                    </Text>
                  )}
                  {!item.checked && item.checked_at && (
                    <Text style={styles.lastBought}>{formatLastBought(item.checked_at)}</Text>
                  )}
                </View>
                <WebMoreButton onPress={() => openItemMenu(item)} />
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyText}>リストが空です</Text>
              <Text style={styles.emptyHint}>下の入力欄から追加しましょう</Text>
            </View>
          }
          contentContainerStyle={[styles.list, rows.length === 0 && styles.listEmpty]}
          keyboardShouldPersistTaps="handled"
        />

        {/* カテゴリ選択 & フィルタ */}
        <View style={styles.catBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catBarContent}>
            {/* すべて */}
            <TouchableOpacity
              style={[styles.catChip, filter === 'all' && styles.catChipFilter]}
              onPress={() => setFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[styles.catChipLabel, filter === 'all' && styles.catChipLabelFilter]}>すべて</Text>
            </TouchableOpacity>

            {CATEGORIES.map(cat => {
              const isFilter = filter === cat.id
              const isAdd = selectedCategory === cat.id
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, isFilter && styles.catChipFilter, isAdd && !isFilter && styles.catChipSelected]}
                  onPress={() => {
                    setSelectedCategory(cat.id)
                    setFilter(cat.id)
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.catChipEmoji}>{cat.emoji}</Text>
                  <Text style={[
                    styles.catChipLabel,
                    isFilter && styles.catChipLabelFilter,
                    isAdd && !isFilter && styles.catChipLabelSelected,
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* 入力バー */}
        <View style={styles.inputBar}>
          {/* 数量ステッパー */}
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setQuantity(q => Math.max(1, q - 1))}
            >
              <Text style={styles.stepBtnText}>－</Text>
            </TouchableOpacity>
            <Text style={styles.stepNum}>{quantity}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setQuantity(q => Math.min(99, q + 1))}
            >
              <Text style={styles.stepBtnText}>＋</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="アイテムを追加..."
            placeholderTextColor={Colors.placeholder}
            returnKeyType="done"
            onSubmitEditing={addItem}
          />
          <TouchableOpacity
            style={[styles.addBtn, (!input.trim() || adding) && { opacity: 0.4 }]}
            onPress={addItem}
            disabled={!input.trim() || adding}
          >
            {adding
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="add" size={24} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary },
  resetBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
  list: { paddingBottom: 8 },
  listEmpty: { flexGrow: 1 },

  catHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingTop: 14, paddingBottom: 4,
  },
  catEmoji: { fontSize: 14 },
  catLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  itemRowChecked: { opacity: 0.45 },
  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  itemName: { fontSize: 16, color: Colors.text, flex: 1 },
  itemNameChecked: { textDecorationLine: 'line-through' },
  itemQty: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  lastBought: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  editInput: {
    fontSize: 16, color: Colors.text,
    borderBottomWidth: 1.5, borderBottomColor: Colors.primary,
    paddingVertical: 2, paddingHorizontal: 0,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 14, color: Colors.textMuted },

  catBar: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    paddingVertical: 8,
  },
  catBarContent: { paddingHorizontal: Spacing.md, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  catChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  catChipFilter: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  catChipLabelFilter: { color: '#fff' },
  catChipEmoji: { fontSize: 14 },
  catChipLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  catChipLabelSelected: { color: Colors.primary },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, overflow: 'hidden',
  },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.bg },
  stepBtnText: { fontSize: 16, color: Colors.text, fontWeight: '700' },
  stepNum: { fontSize: 15, fontWeight: '700', color: Colors.text, minWidth: 26, textAlign: 'center' },
  input: {
    flex: 1, backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.text,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
})
