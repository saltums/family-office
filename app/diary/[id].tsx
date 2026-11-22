import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '@/lib/supabase'
import { appendImageFile } from '@/lib/formFile'
import { useAuthStore } from '@/hooks/useAuthStore'
import { DiaryEntry, PhotoEntry } from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

type DiaryLink = { url: string; title: string }

function parseDiaryLinks(raw: string | null | undefined): DiaryLink[] {
  try {
    if (raw && raw.startsWith('{')) {
      const p = JSON.parse(raw)
      if (Array.isArray(p.links)) return p.links.map((l: any) => ({ url: l.url ?? '', title: l.title ?? '' }))
    }
  } catch {}
  return []
}

export default function DiaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const auth = useAuthStore()
  const userId = auth?.userId ?? null
  const householdId = auth?.householdId ?? null

  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [links, setLinks] = useState<DiaryLink[]>([])
  const [saving, setSaving] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [loading, setLoading] = useState(true)

  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('diary_entries')
      .select('*')
      .eq('id', id)
      .single()
    if (data) {
      setEntry(data as DiaryEntry)
      setContent(data.content)
      setTags(data.tags ?? [])
      setLinks(parseDiaryLinks(data.raw_transcript))
      loadPhotos(data.date)
    }
    setLoading(false)
  }, [id])

  async function loadPhotos(date: string) {
    if (!householdId) return
    const { data } = await supabase
      .from('photo_entries')
      .select('*')
      .eq('household_id', householdId)
      .eq('entry_date', date)
      .order('created_at', { ascending: true })
    if (!data || data.length === 0) return
    const fileids = (data as PhotoEntry[]).map((p) => p.pcloud_file_id)
    const { data: urlData } = await supabase.functions.invoke('get-photo-urls', { body: { fileids } })
    const urlMap = new Map<number, string>()
    for (const u of (urlData?.urls ?? [])) {
      if (u.url) urlMap.set(u.fileid, u.url)
    }
    setPhotos((data as PhotoEntry[]).map((p) => ({ ...p, url: urlMap.get(p.pcloud_file_id) })))
  }

  useEffect(() => { load() }, [load])

  async function handleAddPhoto() {
    try {
      if (!userId || !householdId || !entry) {
        Alert.alert('認証エラー', 'ユーザー情報が取得できていません')
        return
      }
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (permResult.status !== 'granted') {
        Alert.alert('権限が必要です', `写真ライブラリへのアクセスを許可してください\n(status: ${permResult.status})`)
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      })
      if (result.canceled || !result.assets?.[0]) return

      setUploading(true)
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1500 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        )
        const filename = `photo_${Date.now()}.jpg`
        const form = new FormData()
        await appendImageFile(form, 'file', compressed.uri, filename)
        form.append('household_id', householdId)
        form.append('date', entry.date)

        const { data: uploadData, error: uploadErr } = await supabase.functions.invoke('upload-photo', { body: form })
        if (uploadErr) throw new Error('upload-photo: ' + uploadErr.message)
        if (uploadData?.error) throw new Error(uploadData.error)

        const { data: inserted, error: insertErr } = await supabase
          .from('photo_entries')
          .insert({
            household_id: householdId,
            entry_date: entry.date,
            pcloud_file_id: uploadData.fileid,
            pcloud_path: uploadData.path,
            created_by: userId,
          })
          .select().single()
        if (insertErr) throw new Error(insertErr.message)

        const { data: urlData } = await supabase.functions.invoke('get-photo-urls', {
          body: { fileids: [uploadData.fileid] },
        })
        const url = urlData?.urls?.[0]?.url ?? undefined
        setPhotos((prev) => [...prev, { ...(inserted as PhotoEntry), url }])
      } finally {
        setUploading(false)
      }
    } catch (e: any) {
      console.error('photo upload error:', e)
      Alert.alert('エラー', e.message ?? String(e))
    }
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags([...tags, t])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  async function formatWithAI() {
    const text = content.trim()
    if (!text) return
    setFormatting(true)
    try {
      const { data } = await supabase.functions.invoke('format-diary', {
        body: { transcript: text, proofread: true },
      })
      if (data?.content) setContent(data.content)
      if (data?.tags?.length) {
        const newTags = data.tags.filter((t: string) => !tags.includes(t))
        setTags((prev) => [...prev, ...newTags])
      }
    } catch {
      Alert.alert('推敲エラー', 'テキストをそのまま使います')
    }
    setFormatting(false)
  }

  function addLink() { setLinks(prev => [...prev, { url: '', title: '' }]) }
  function updateLink(idx: number, field: 'url' | 'title', val: string) {
    setLinks(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }
  function removeLink(idx: number) { setLinks(prev => prev.filter((_, i) => i !== idx)) }

  async function save() {
    if (!content.trim()) { Alert.alert('入力エラー', '内容を入力してください'); return }
    setSaving(true)
    const validLinks = links.filter(l => l.url.trim())
    let raw_transcript: string | null = entry?.raw_transcript ?? null
    if (validLinks.length > 0) {
      const cleanLinks = validLinks.map(l => l.title.trim() ? l : { url: l.url.trim() })
      const prevPayload = raw_transcript && raw_transcript.startsWith('{') ? (() => { try { return JSON.parse(raw_transcript!) } catch { return {} } })() : {}
      raw_transcript = JSON.stringify({ ...prevPayload, links: cleanLinks })
    } else if (raw_transcript && raw_transcript.startsWith('{')) {
      try {
        const p = JSON.parse(raw_transcript)
        delete p.links
        raw_transcript = Object.keys(p).length ? JSON.stringify(p) : null
      } catch {}
    }
    const { error } = await supabase
      .from('diary_entries')
      .update({ content: content.trim(), tags, raw_transcript })
      .eq('id', id)
    setSaving(false)
    if (error) { Alert.alert('エラー', error.message); return }
    setEntry((prev) => prev ? { ...prev, content: content.trim(), tags, raw_transcript } : prev)
    setEditing(false)
    // 編集内容から知識を再抽出（非同期・ユーザーは待たない）
    if (householdId) {
      supabase.functions.invoke('extract-knowledge', {
        body: { diary_content: content.trim(), household_id: householdId, diary_date: entry?.date },
      }).catch(() => {})
    }
  }

  async function deleteEntry() {
    Alert.alert('削除確認', 'この日記を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('diary_entries').delete().eq('id', id)
          router.back()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={{ color: Colors.textMuted }}>見つかりませんでした</Text></View>
      </SafeAreaView>
    )
  }

  const dateStr = entry.date.replace(/-/g, '/')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{dateStr}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {!editing && (
            <TouchableOpacity onPress={deleteEntry} hitSlop={8}>
              <Ionicons name="trash-outline" size={22} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={editing ? save : () => setEditing(true)}
            hitSlop={8}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name={editing ? 'checkmark' : 'pencil'} size={22} color={Colors.primary} />
            }
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity onPress={() => { setEditing(false); setContent(entry.content); setTags(entry.tags ?? []); setLinks(parseDiaryLinks(entry.raw_transcript)) }} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 写真エリア */}
        <View style={styles.photoRow}>
          {photos.map((p) =>
            p.url ? (
              <Image key={p.id} source={{ uri: p.url }} style={styles.photo} />
            ) : (
              <View key={p.id} style={[styles.photo, styles.photoPlaceholder]}>
                <ActivityIndicator size="small" color={Colors.textMuted} />
              </View>
            )
          )}
          {uploading ? (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <TouchableOpacity style={[styles.photo, styles.addPhoto]} onPress={handleAddPhoto} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={20} color={Colors.primary} />
              <Text style={styles.addPhotoText}>追加</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* タグ */}
        {(tags.length > 0 || editing) && (
          <View style={styles.section}>
            <View style={styles.tagRow}>
              {tags.map((tag) =>
                editing ? (
                  <TouchableOpacity key={tag} style={styles.tag} onPress={() => removeTag(tag)}>
                    <Text style={styles.tagText}>#{tag}</Text>
                    <Ionicons name="close" size={12} color={Colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                )
              )}
            </View>
            {editing && (
              <View style={styles.tagInputRow}>
                <TextInput
                  style={styles.tagInput}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="タグを追加"
                  placeholderTextColor={Colors.placeholder}
                  returnKeyType="done"
                  onSubmitEditing={addTag}
                />
                <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* 内容 */}
        {editing ? (
          <>
            {content.length > 0 && !formatting && (
              <TouchableOpacity style={styles.aiBtn} onPress={formatWithAI}>
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={styles.aiBtnText}>AIで推敲</Text>
              </TouchableOpacity>
            )}
            {formatting && (
              <View style={styles.formattingRow}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text style={styles.formattingText}>推敲中...</Text>
              </View>
            )}
            <TextInput
              style={styles.textArea}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              autoFocus
              placeholderTextColor={Colors.placeholder}
            />
          </>
        ) : (
          <Text style={styles.contentText}>{entry.content}</Text>
        )}

        {/* リンクセクション */}
        {(links.length > 0 || editing) && (
          <View style={styles.linksSection}>
            <Text style={styles.linksSectionLabel}>関連リンク</Text>
            {editing ? (
              <>
                {links.map((link, idx) => (
                  <View key={idx} style={styles.linkFieldCard}>
                    <TouchableOpacity style={styles.linkRemoveBtn} onPress={() => removeLink(idx)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.linkInput}
                      value={link.url}
                      onChangeText={v => updateLink(idx, 'url', v)}
                      placeholder="https://..."
                      placeholderTextColor={Colors.placeholder}
                      keyboardType="url"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[styles.linkInput, { marginTop: 8 }]}
                      value={link.title}
                      onChangeText={v => updateLink(idx, 'title', v)}
                      placeholder="タイトル（任意）"
                      placeholderTextColor={Colors.placeholder}
                    />
                  </View>
                ))}
                <TouchableOpacity style={styles.addLinkBtn} onPress={addLink}>
                  <Ionicons name="add" size={18} color={Colors.primary} />
                  <Text style={styles.addLinkText}>リンクを追加</Text>
                </TouchableOpacity>
              </>
            ) : (
              links.filter(l => l.url.trim()).map((link, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.linkItem}
                  onPress={() => Linking.openURL(link.url).catch(() => Alert.alert('エラー', 'URLを開けませんでした'))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkIcon}>🔗</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkTitle} numberOfLines={2}>{link.title || link.url}</Text>
                    {link.title ? <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text> : null}
                  </View>
                  <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.metaText}>
          {new Date(entry.created_at).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 作成
        </Text>
      </ScrollView>
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
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.md, paddingBottom: 60 },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  photo: { width: 80, height: 80, borderRadius: Radius.md, overflow: 'hidden' },
  photoPlaceholder: { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  addPhoto: {
    backgroundColor: tint(Colors.primary, '12'),
    borderWidth: 1.5,
    borderColor: tint(Colors.primary, '44'),
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  section: { marginBottom: Spacing.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: tint(Colors.primary, '18'), borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tagText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: Colors.text,
  },
  tagAddBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 8 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7C3AED', borderRadius: Radius.md,
    paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10, alignSelf: 'flex-start',
  },
  aiBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  formattingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  formattingText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  contentText: { fontSize: 16, color: Colors.text, lineHeight: 26 },
  textArea: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, fontSize: 16, color: Colors.text,
    minHeight: 200, lineHeight: 26,
  },
  metaText: { fontSize: 12, color: Colors.textMuted, marginTop: 20 },
  linksSection: { marginTop: Spacing.md },
  linksSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  linkItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    marginBottom: 8,
  },
  linkIcon: { fontSize: 18 },
  linkTitle: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  linkUrl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  linkFieldCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    marginBottom: 10, position: 'relative',
  },
  linkRemoveBtn: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  linkInput: {
    fontSize: 15, color: Colors.text, borderBottomWidth: 1,
    borderBottomColor: Colors.border, paddingVertical: 4,
  },
  addLinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    borderStyle: 'dashed', paddingVertical: 10, paddingHorizontal: 14,
    justifyContent: 'center', marginTop: 4,
  },
  addLinkText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
})
