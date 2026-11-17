import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Easing, PermissionsAndroid, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import Voice from '@/lib/voice'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/hooks/useAuthStore'
import { Colors, Radius, Spacing } from '@/lib/theme'

type KnowledgeItem = {
  id: string
  title: string
  content: string
  category: 'person' | 'place' | 'event' | 'other'
  metadata?: Record<string, string>
  source?: string
  created_at: string
  updated_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  person: '👤 人物',
  place: '📍 場所',
  event: '📅 出来事',
  other: '📌 その他',
}
const CATEGORY_COLOR: Record<string, string> = {
  person: '#3B82F6',
  place: '#10B981',
  event: '#F59E0B',
  other: '#8B5CF6',
}
const META_LABEL: Record<string, string> = {
  birth_date: '生年月日',
  relationship: '続柄',
  address: '住所',
  nearest_station: '最寄駅',
  event_date: '日付',
  location: '場所',
  phone: '電話',
  memo: 'メモ',
}

export default function MemoriesScreen() {
  const auth = useAuthStore()
  const householdId = auth?.householdId ?? null
  const userId = auth?.userId ?? null

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Array<{ title: string; content: string; category: string }> | null>(null)

  // 詳細モーダル
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null)
  const [detailText, setDetailText] = useState('')
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailRecording, setDetailRecording] = useState(false)
  const [detailSaved, setDetailSaved] = useState(false)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const detailPulse = useRef(new Animated.Value(1)).current
  const baseText = useRef('')
  const detailBaseText = useRef('')
  const isRecordingRef = useRef(false)
  const userStopped = useRef(false)
  // 'main' | 'detail' — どちらの入力欄に音声を流すか
  const recordingFor = useRef<'main' | 'detail'>('main')

  const load = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const { data } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('household_id', householdId)
      .order('updated_at', { ascending: false })
    setItems((data ?? []) as KnowledgeItem[])
    setLoading(false)
  }, [householdId])

  useEffect(() => { load() }, [load])

  // メイン録音アニメーション
  useEffect(() => {
    if (recording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start()
    } else { pulseAnim.stopAnimation(); pulseAnim.setValue(1) }
  }, [recording])

  // 詳細録音アニメーション
  useEffect(() => {
    if (detailRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(detailPulse, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(detailPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start()
    } else { detailPulse.stopAnimation(); detailPulse.setValue(1) }
  }, [detailRecording])

  // Voice イベント（main / detail 両方で共用）
  useEffect(() => {
    Voice.onSpeechPartialResults = (e) => {
      const partial = e.value?.[0] ?? ''
      if (!partial) return
      if (recordingFor.current === 'detail') {
        setDetailText(detailBaseText.current ? detailBaseText.current + '\n' + partial : partial)
      } else {
        setText(baseText.current ? baseText.current + '\n' + partial : partial)
      }
    }
    Voice.onSpeechResults = (e) => {
      const t = e.value?.[0] ?? ''
      if (!t) return
      if (recordingFor.current === 'detail') {
        const combined = detailBaseText.current ? detailBaseText.current + '\n' + t : t
        detailBaseText.current = combined
        setDetailText(combined)
      } else {
        const combined = baseText.current ? baseText.current + '\n' + t : t
        baseText.current = combined
        setText(combined)
      }
    }
    Voice.onSpeechEnd = () => {
      if (!userStopped.current && isRecordingRef.current) {
        setTimeout(() => {
          if (userStopped.current || !isRecordingRef.current) return
          Voice.start('ja-JP').catch(() => {
            setRecording(false); setDetailRecording(false); isRecordingRef.current = false
          })
        }, 800)
      } else { setRecording(false); setDetailRecording(false); isRecordingRef.current = false }
    }
    Voice.onSpeechError = (e) => {
      const msg = String(e.error?.message ?? e.error?.code ?? e.error ?? '')
      const code = parseInt(msg.replace(/[^0-9].*/, ''), 10)
      const recoverable = !userStopped.current && isRecordingRef.current &&
        (code === 1 || code === 5 || code === 6 || code === 7 ||
         msg.includes('1/') || msg.includes('5/') || msg.includes('6/') || msg.includes('7/'))
      if (recoverable) {
        setTimeout(() => {
          if (userStopped.current || !isRecordingRef.current) return
          Voice.start('ja-JP').catch(() => { setRecording(false); setDetailRecording(false); isRecordingRef.current = false })
        }, code === 8 ? 1500 : 800)
      } else { setRecording(false); setDetailRecording(false); isRecordingRef.current = false }
    }
    return () => { Voice.destroy().then(Voice.removeAllListeners) }
  }, [])

  async function startVoice(mode: 'main' | 'detail') {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('マイクの許可が必要です', '設定アプリから許可してください'); return
      }
    }
    recordingFor.current = mode
    if (mode === 'detail') {
      detailBaseText.current = detailText
    } else {
      baseText.current = text
    }
    userStopped.current = false; isRecordingRef.current = true
    if (mode === 'detail') setDetailRecording(true); else setRecording(true)
    try { await Voice.start('ja-JP') } catch (e: any) {
      setRecording(false); setDetailRecording(false); isRecordingRef.current = false
      Alert.alert('音声認識エラー', e.message)
    }
  }

  async function stopVoice() {
    userStopped.current = true; isRecordingRef.current = false
    setRecording(false); setDetailRecording(false)
    try { await Voice.stop() } catch {}
  }

  async function toggleRecording(mode: 'main' | 'detail') {
    if (isRecordingRef.current) { await stopVoice(); return }
    await startVoice(mode)
  }

  async function save() {
    if (!text.trim() || !householdId) return
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('remember', {
        body: { text: text.trim(), household_id: householdId, user_id: userId },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setLastSaved(data?.saved ?? [])
      setText(''); baseText.current = ''
      await load()
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally { setSaving(false) }
  }

  async function saveDetailInfo() {
    if (!detailText.trim() || !selectedItem || !householdId) return
    setDetailSaving(true)
    try {
      // 既存情報をコンテキストとして前置して送る
      const contextText = `「${selectedItem.title}」について追加情報:\n${detailText.trim()}\n\n（既存情報: ${selectedItem.content}）`
      const { data, error } = await supabase.functions.invoke('remember', {
        body: { text: contextText, household_id: householdId, user_id: userId },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setDetailText(''); detailBaseText.current = ''
      setDetailSaved(true)
      setTimeout(() => setDetailSaved(false), 3000)
      await load()
      // モーダル内の表示を更新
      const updated = (await supabase.from('knowledge_items').select('*').eq('id', selectedItem.id).single()).data
      if (updated) setSelectedItem(updated as KnowledgeItem)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally { setDetailSaving(false) }
  }

  function openDetail(item: KnowledgeItem) {
    setSelectedItem(item)
    setDetailText('')
    detailBaseText.current = ''
    setDetailSaved(false)
  }

  function closeDetail() {
    if (isRecordingRef.current) stopVoice()
    setSelectedItem(null)
    setDetailText('')
  }

  async function deleteItem(item: KnowledgeItem) {
    Alert.alert('削除', `「${item.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('knowledge_items').delete().eq('id', item.id)
          setItems(prev => prev.filter(i => i.id !== item.id))
          if (selectedItem?.id === item.id) setSelectedItem(null)
        },
      },
    ])
  }

  const filtered = filter ? items.filter(i => i.category === filter) : items
  const knownMeta = (meta: Record<string, string>) =>
    Object.entries(meta).filter(([k]) => k in META_LABEL)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>AIの記憶</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* 新規入力エリア */}
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="覚えておいてほしいことを話すか入力..."
              placeholderTextColor={Colors.placeholder}
              multiline
            />
            {Platform.OS !== 'web' && (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.micBtn, recording && styles.micBtnActive]}
                onPress={() => toggleRecording('main')}
              >
                <Ionicons name={recording ? 'stop' : 'mic'} size={20} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
            )}
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, (!text.trim() || saving) && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!text.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="bookmark" size={16} color="#fff" /><Text style={styles.saveBtnText}>覚えておいて</Text></>}
          </TouchableOpacity>
        </View>

        {/* 保存確認 */}
        {lastSaved && lastSaved.length > 0 && (
          <View style={styles.savedBanner}>
            <View style={styles.savedBannerHeader}>
              <Text style={styles.savedBannerTitle}>✅ 覚えました！</Text>
              <TouchableOpacity onPress={() => setLastSaved(null)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#065F46" />
              </TouchableOpacity>
            </View>
            {lastSaved.map((s, i) => (
              <Text key={i} style={styles.savedBannerItem}>
                {CATEGORY_LABEL[s.category] ?? '📌'} <Text style={{ fontWeight: '700' }}>{s.title}</Text>
              </Text>
            ))}
          </View>
        )}

        {/* カテゴリフィルター */}
        <View style={styles.filterRow}>
          {[null, 'person', 'place', 'event', 'other'].map(cat => (
            <TouchableOpacity
              key={cat ?? 'all'}
              style={[styles.filterChip, filter === cat && styles.filterChipActive]}
              onPress={() => setFilter(cat)}
            >
              <Text style={[styles.filterChipText, filter === cat && styles.filterChipTextActive]}>
                {cat === null ? 'すべて' : CATEGORY_LABEL[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🧠</Text>
            <Text style={styles.emptyText}>まだ記憶がありません</Text>
            <Text style={styles.emptyHint}>上のフォームに話しかけてみてください</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.7} onPress={() => openDetail(item)}>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.categoryBadge, { backgroundColor: (CATEGORY_COLOR[item.category] ?? '#8B5CF6') + '18' }]}>
                      <Text style={[styles.categoryText, { color: CATEGORY_COLOR[item.category] ?? '#8B5CF6' }]}>
                        {CATEGORY_LABEL[item.category] ?? '📌 その他'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteItem(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardContent} numberOfLines={2}>{item.content}</Text>
                  {item.metadata && knownMeta(item.metadata).length > 0 && (
                    <View style={styles.metaRow}>
                      {knownMeta(item.metadata).map(([k, v]) => (
                        <Text key={k} style={styles.metaChip}>{META_LABEL[k]}: {v}</Text>
                      ))}
                    </View>
                  )}
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardDate}>
                      {item.source === 'user_memory' ? '🤝 手動登録' : '📔 日記から抽出'} · {new Date(item.updated_at).toLocaleDateString('ja-JP')}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>

      {/* 詳細・追記モーダル */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              {/* ヘッダー */}
              <View style={styles.modalHeader}>
                <View style={[styles.categoryBadge, { backgroundColor: (CATEGORY_COLOR[selectedItem?.category ?? 'other']) + '18' }]}>
                  <Text style={[styles.categoryText, { color: CATEGORY_COLOR[selectedItem?.category ?? 'other'] }]}>
                    {CATEGORY_LABEL[selectedItem?.category ?? 'other']}
                  </Text>
                </View>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedItem?.title}</Text>
                <TouchableOpacity onPress={closeDetail} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* 既存情報 */}
                <View style={styles.existingBlock}>
                  <Text style={styles.existingLabel}>現在の情報</Text>
                  <Text style={styles.existingContent}>{selectedItem?.content}</Text>
                  {selectedItem?.metadata && knownMeta(selectedItem.metadata).length > 0 && (
                    <View style={[styles.metaRow, { marginTop: 8 }]}>
                      {knownMeta(selectedItem.metadata).map(([k, v]) => (
                        <Text key={k} style={styles.metaChip}>{META_LABEL[k]}: {v}</Text>
                      ))}
                    </View>
                  )}
                </View>

                {/* 保存完了バナー */}
                {detailSaved && (
                  <View style={styles.detailSavedBanner}>
                    <Text style={styles.detailSavedText}>✅ 追記して整理しました</Text>
                  </View>
                )}

                {/* 追記入力 */}
                <View style={styles.detailInputSection}>
                  <Text style={styles.detailInputLabel}>追加情報を話す・入力する</Text>
                  <View style={styles.detailInputRow}>
                    <TextInput
                      style={styles.detailInput}
                      value={detailText}
                      onChangeText={setDetailText}
                      placeholder={`「${selectedItem?.title}」について追記...`}
                      placeholderTextColor={Colors.placeholder}
                      multiline
                      autoFocus={false}
                    />
                    {Platform.OS !== 'web' && (
                    <Animated.View style={{ transform: [{ scale: detailPulse }] }}>
                      <TouchableOpacity
                        style={[styles.micBtn, detailRecording && styles.micBtnActive]}
                        onPress={() => toggleRecording('detail')}
                      >
                        <Ionicons name={detailRecording ? 'stop' : 'mic'} size={20} color="#fff" />
                      </TouchableOpacity>
                    </Animated.View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.detailSaveBtn, (!detailText.trim() || detailSaving) && styles.saveBtnDisabled]}
                    onPress={saveDetailInfo}
                    disabled={!detailText.trim() || detailSaving}
                  >
                    {detailSaving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={styles.saveBtnText}>AIが整理して追記</Text></>}
                  </TouchableOpacity>
                </View>

                {/* 削除ボタン */}
                <TouchableOpacity style={styles.modalDeleteBtn} onPress={() => { closeDetail(); deleteItem(selectedItem!) }}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={styles.modalDeleteText}>この記憶を削除</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  inputArea: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  input: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, minHeight: 50, maxHeight: 120,
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: Colors.danger },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', borderRadius: Radius.md, paddingVertical: 12,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md,
    paddingVertical: 10, flexWrap: 'wrap',
  },
  filterChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyHint: { fontSize: 13, color: Colors.textMuted },
  list: { padding: Spacing.md, gap: 12, paddingBottom: 60 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textMuted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    fontSize: 11, color: Colors.textMuted,
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  savedBanner: {
    backgroundColor: '#D1FAE5', borderLeftWidth: 4, borderLeftColor: '#10B981',
    marginHorizontal: Spacing.md, marginVertical: 8, padding: Spacing.md,
    borderRadius: Radius.md, gap: 6,
  },
  savedBannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedBannerTitle: { fontSize: 14, fontWeight: '700', color: '#065F46' },
  savedBannerItem: { fontSize: 13, color: '#065F46', lineHeight: 20 },
  // モーダル
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  modalBody: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  existingBlock: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  existingLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  existingContent: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  detailSavedBanner: {
    backgroundColor: '#D1FAE5', borderRadius: Radius.md,
    padding: 10, marginBottom: Spacing.md, alignItems: 'center',
  },
  detailSavedText: { fontSize: 14, fontWeight: '700', color: '#065F46' },
  detailInputSection: { gap: 10, marginBottom: Spacing.md },
  detailInputLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  detailInputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  detailInput: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, minHeight: 60, maxHeight: 140,
  },
  detailSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12,
  },
  modalDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginBottom: 20,
  },
  modalDeleteText: { fontSize: 14, color: Colors.danger, fontWeight: '600' },
})
