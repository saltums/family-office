import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing } from '@/lib/theme'
import { WebMoreButton } from '@/components/WebMoreButton'

interface Bookmark {
  id: string
  household_id: string
  name: string
  url: string
  sort_order: number
  created_by: string
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return 'https://' + trimmed
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname !== '/' ? u.pathname : '')
  } catch {
    return url
  }
}

export default function BookmarksScreen() {
  const auth = useAuthStore()
  const householdId = auth?.householdId ?? null

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const fetchBookmarks = useCallback(async () => {
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (data) setBookmarks(data as Bookmark[])
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchBookmarks() }, [fetchBookmarks])

  async function addBookmark() {
    const name = newName.trim()
    const url = normalizeUrl(newUrl)
    if (!name || !url || !auth?.userId || !householdId) return
    setSaving(true)
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        household_id: householdId,
        name,
        url,
        sort_order: bookmarks.length,
        created_by: auth.userId,
      })
      .select()
      .single()
    if (!error && data) {
      setBookmarks(prev => [...prev, data as Bookmark])
      setNewName('')
      setNewUrl('')
      setAddModal(false)
    }
    setSaving(false)
  }

  async function deleteBookmark(id: string, name: string) {
    Alert.alert('削除', `「${name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('bookmarks').delete().eq('id', id)
          setBookmarks(prev => prev.filter(b => b.id !== id))
        },
      },
    ])
  }

  async function openUrl(url: string, name: string) {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('エラー', `「${name}」を開けませんでした`)
    }
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>よく使うページ</Text>
      </View>

      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.bookmarkRow}
            onPress={() => openUrl(item.url, item.name)}
            onLongPress={() => deleteBookmark(item.id, item.name)}
            activeOpacity={0.7}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="globe-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.bookmarkBody}>
              <Text style={styles.bookmarkName}>{item.name}</Text>
              <Text style={styles.bookmarkUrl} numberOfLines={1}>{displayUrl(item.url)}</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
            <WebMoreButton onPress={() => deleteBookmark(item.id, item.name)} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>まだ登録がありません</Text>
            <Text style={styles.emptyText}>右下の＋からよく使うページを追加</Text>
          </View>
        }
        contentContainerStyle={[styles.list, bookmarks.length === 0 && styles.listEmpty]}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setAddModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={addModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setAddModal(false); setNewName(''); setNewUrl('') }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setAddModal(false); setNewName(''); setNewUrl('') }} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>ページを追加</Text>
              <TouchableOpacity
                onPress={addBookmark}
                disabled={!newName.trim() || !newUrl.trim() || saving}
                style={[styles.saveBtn, (!newName.trim() || !newUrl.trim() || saving) && { opacity: 0.4 }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>追加</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>名前</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="例: Amazon, 市役所, 学校HP"
                placeholderTextColor={Colors.placeholder}
                autoFocus
                returnKeyType="next"
              />
              <Text style={styles.fieldLabel}>URL</Text>
              <TextInput
                style={styles.input}
                value={newUrl}
                onChangeText={setNewUrl}
                placeholder="例: amazon.co.jp / https://..."
                placeholderTextColor={Colors.placeholder}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={addBookmark}
              />
              <Text style={styles.hint}>「長押し」で削除できます</Text>
            </View>
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
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backBtn: { marginRight: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  list: { paddingTop: Spacing.md, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    marginBottom: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkBody: { flex: 1 },
  bookmarkName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  bookmarkUrl: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  fab: {
    position: 'absolute', right: 24, bottom: 32,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
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
  modalBody: { padding: Spacing.md, gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 8 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 12, textAlign: 'center' },
})
