import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Animated,
  Easing,
} from 'react-native'
import DateTimePicker from '@/components/DateTimePicker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import Voice from '@/lib/voice'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { readAuthCache, writeAuthCache, readDeviceHid } from '@/lib/authCache'
import { getAuthStore } from '@/lib/authStore'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'
import { APP_VERSION } from '@/lib/version'

export default function NewDiaryScreen() {
  const { uid: paramUid, hid: paramHid } = useLocalSearchParams<{ uid: string; hid: string }>()
  const [content, setContent] = useState('')
  const [debugInfo, setDebugInfo] = useState('...')

  // 診断: 開いた瞬間にストレージ状態を確認
  useEffect(() => {
    async function diagnose() {
      await AsyncStorage.setItem('@fo/test', 'ok')
      const testRead = await AsyncStorage.getItem('@fo/test')
      const store = getAuthStore()
      const storeInfo = store?.householdId ? `u:${store.userId.slice(0,4)} h:${store.householdId.slice(0,4)}` : 'null'
      const { data: { session } } = await supabase.auth.getSession()
      const pInfo = (paramUid && paramHid)
        ? `u:${paramUid.slice(0,4)} h:${paramHid.slice(0,4)}`
        : 'null'
      // Supabaseセッションキーが AsyncStorage に存在するか確認
      const sbKey = 'sb-uyzngbjkwbvouxmowfhu-auth-token'
      const sbRaw = await AsyncStorage.getItem(sbKey)
      const sbInfo = sbRaw ? `sbAS:${sbRaw.length}B` : 'sbAS:none'
      setDebugInfo(
        `v${APP_VERSION} AS:${testRead ?? 'null'} ${sbInfo} | p:${pInfo} | store:${storeInfo} | sess:${session?.user.id ? session.user.id.slice(0,8) : 'null'}`
      )
    }
    diagnose()
  }, [])
  const [tags, setTags] = useState<string[]>([])
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [links, setLinks] = useState<Array<{url: string; title: string}>>([])
  const [saving, setSaving] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [extractingTags, setExtractingTags] = useState(false)
  const [recording, setRecording] = useState(false)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const pendingText = useRef('')
  const tagDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baseText = useRef('')       // 確定済み累積テキスト（複数音声セグメントをまたいで保持）
  const isRecordingRef = useRef(false)  // Voiceコールバック内で参照する録音状態
  const userStopped = useRef(false)     // ユーザーが停止ボタンを押したかどうか

  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`


  // 録音アニメーション
  useEffect(() => {
    if (recording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start()
    } else {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(1)
    }
  }, [recording])

  // Voiceイベント
  useEffect(() => {
    Voice.onSpeechStart = () => {}

    // 認識中（部分結果）: 確定済みテキスト + 今のセグメント部分を表示（上書きしない）
    Voice.onSpeechPartialResults = (e) => {
      const partial = e.value?.[0] ?? ''
      if (!partial) return
      const combined = baseText.current
        ? baseText.current + '\n' + partial
        : partial
      setContent(combined)
    }

    // セグメント確定: baseTextに追記
    Voice.onSpeechResults = (e) => {
      const text = e.value?.[0] ?? ''
      if (!text) return
      const combined = baseText.current
        ? baseText.current + '\n' + text
        : text
      baseText.current = combined
      pendingText.current = combined
      setContent(combined)
    }

    // 発話のポーズ: ユーザーが停止ボタンを押していなければ自動再開
    Voice.onSpeechEnd = () => {
      if (!userStopped.current && isRecordingRef.current) {
        setTimeout(() => {
          if (userStopped.current || !isRecordingRef.current) return
          Voice.start('ja-JP').catch(() => {
            setRecording(false)
            isRecordingRef.current = false
          })
        }, 800)
      } else {
        setRecording(false)
        isRecordingRef.current = false
      }
    }

    // エラーで自動再開: 6=timeout, 7=no match, 5=client, 1=network timeout, 8=busy
    // 3=audio, 9=permission は停止
    Voice.onSpeechError = (e) => {
      const msg = String(e.error?.message ?? e.error?.code ?? e.error ?? '')
      const code = parseInt(msg.replace(/[^0-9].*/, ''), 10)
      const isRecoverable = !userStopped.current && isRecordingRef.current &&
        (code === 1 || code === 5 || code === 6 || code === 7 ||
         msg.includes('1/') || msg.includes('5/') || msg.includes('6/') || msg.includes('7/'))
      const delay = code === 8 ? 1500 : 800  // busy なら長め
      if (isRecoverable) {
        setTimeout(() => {
          if (userStopped.current || !isRecordingRef.current) return
          Voice.start('ja-JP').catch(() => {
            setRecording(false)
            isRecordingRef.current = false
          })
        }, delay)
      } else {
        setRecording(false)
        isRecordingRef.current = false
      }
    }

    return () => { Voice.destroy().then(Voice.removeAllListeners) }
  }, [])

  // テキスト変化でタグ自動候補抽出（1.5秒デバウンス）
  useEffect(() => {
    if (tagDebounce.current) clearTimeout(tagDebounce.current)
    if (content.trim().length < 15) { setSuggestedTags([]); return }
    tagDebounce.current = setTimeout(() => extractTagSuggestions(content), 1500)
    return () => { if (tagDebounce.current) clearTimeout(tagDebounce.current) }
  }, [content])

  async function extractTagSuggestions(text: string) {
    setExtractingTags(true)
    try {
      const { data } = await supabase.functions.invoke('format-diary', {
        body: { transcript: text, tagsOnly: true },
      })
      if (data?.tags?.length) {
        // 既存タグを除外して候補を表示
        setSuggestedTags(data.tags.filter((t: string) => !tags.includes(t)))
      }
    } catch {}
    setExtractingTags(false)
  }

  async function toggleRecording() {
    if (isRecordingRef.current) {
      // ユーザーが明示的に停止
      userStopped.current = true
      isRecordingRef.current = false
      setRecording(false)
      try { await Voice.stop() } catch {}
      return
    }

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('マイクの許可が必要です', '設定アプリから許可してください')
        return
      }
    }

    // 現在のテキストをベースとして引き継ぐ（続きを話す場合に追記される）
    baseText.current = content
    pendingText.current = content
    userStopped.current = false
    isRecordingRef.current = true
    setRecording(true)

    try { await Voice.start('ja-JP') } catch (e: any) {
      setRecording(false)
      isRecordingRef.current = false
      Alert.alert('音声認識エラー', e.message)
    }
  }

  async function formatWithClaude() {
    const text = content.trim()
    if (!text) return
    setFormatting(true)
    try {
      const { data } = await supabase.functions.invoke('format-diary', {
        body: { transcript: text },
      })
      if (data?.content) setContent(data.content)
      if (data?.tags?.length) {
        const newTags = data.tags.filter((t: string) => !tags.includes(t))
        setTags((prev) => [...prev, ...newTags])
        setSuggestedTags([])
      }
    } catch {
      Alert.alert('整形エラー', 'テキストをそのまま使います')
    }
    setFormatting(false)
  }

  function addLink() {
    setLinks(prev => [...prev, { url: '', title: '' }])
  }
  function updateLink(idx: number, field: 'url' | 'title', val: string) {
    setLinks(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }
  function removeLink(idx: number) {
    setLinks(prev => prev.filter((_, i) => i !== idx))
  }

  function addTag(tag: string) {
    if (tags.includes(tag)) return
    setTags((prev) => [...prev, tag])
    setSuggestedTags((prev) => prev.filter((t) => t !== tag))
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function addInputTag() {
    const t = tagInput.trim()
    if (!t) return
    addTag(t)
    setTagInput('')
  }

  async function save() {
    if (!content.trim()) { Alert.alert('入力エラー', '内容を入力してください'); return }
    setSaving(true)
    try {
      let finalUid: string | null = null
      let finalHid: string | null = null

      // Step 1: params（diary画面から渡された auth、最も信頼性が高い）
      if (paramUid && paramHid) {
        finalUid = paramUid
        finalHid = paramHid
      }

      // Step 2: authStore
      if (!finalUid || !finalHid) {
        const store = getAuthStore()
        if (store?.userId && store?.householdId) {
          finalUid = store.userId
          finalHid = store.householdId
        }
      }

      // Step 3: キャッシュ
      if (!finalUid || !finalHid) {
        const cached = await readAuthCache()
        if (cached?.userId && cached?.householdId) {
          finalUid = cached.userId
          finalHid = cached.householdId
        }
      }

      // Step 4: authStoreポーリング（auto-rejoin処理が完了するまで最大4秒待つ）
      if (!finalUid || !finalHid) {
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 500))
          const store = getAuthStore()
          if (store?.userId && store?.householdId) {
            finalUid = store.userId
            finalHid = store.householdId
            break
          }
        }
      }

      // Step 5: getSession + device_hid フォールバック
      if (!finalUid || !finalHid) {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user.id
        if (uid) {
          const deviceHid = await readDeviceHid()
          if (deviceHid) {
            finalUid = uid
            finalHid = deviceHid
          } else {
            const { data: hm } = await supabase.from('household_members').select('household_id').eq('user_id', uid).single()
            if (hm?.household_id) { finalUid = uid; finalHid = hm.household_id }
          }
        }
      }

      if (!finalUid || !finalHid) {
        Alert.alert('エラー', 'ログアウトされています。アプリを再起動してください。')
        return
      }

      const validLinks = links.filter(l => l.url.trim())
      let raw_transcript: string | null = null
      if (validLinks.length > 0) {
        const payload: Record<string, unknown> = { links: validLinks.map(l => l.title.trim() ? l : { url: l.url.trim() }) }
        if (pendingText.current) payload.transcript = pendingText.current
        raw_transcript = JSON.stringify(payload)
      } else {
        raw_transcript = pendingText.current || null
      }
      const { error } = await supabase.from('diary_entries').insert({
        household_id: finalHid!,
        created_by: finalUid!,
        date: dateStr,
        content: content.trim(),
        raw_transcript,
        tags,
      })
      if (error) { Alert.alert('保存エラー', error.message); return }

      // 非同期で知識抽出（ユーザーは待たない）
      supabase.functions.invoke('extract-knowledge', {
        body: { diary_content: content.trim(), household_id: finalHid!, diary_date: dateStr },
      }).catch(() => {})

      router.back()
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>新しい出来事</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>保存</Text>}
        </TouchableOpacity>
      </View>

      {/* 日付ピッカー */}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(_, selected) => {
            if (Platform.OS !== 'ios') setShowDatePicker(false)
            if (selected) setDate(selected)
          }}
        />
      )}
      {showDatePicker && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.datePickerDoneRow} onPress={() => setShowDatePicker(false)}>
          <Text style={styles.datePickerDone}>完了</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.dateLabelBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.dateLabel}>{dateStr.replace(/-/g, '/')} の出来事</Text>
          <Ionicons name="chevron-down" size={13} color={Colors.textMuted} />
        </TouchableOpacity>
        {/* 診断表示（一時） */}
        <Text style={{fontSize:9, color:'#999', paddingHorizontal:16, paddingBottom:4}} selectable>{debugInfo}</Text>

        {/* 音声入力 */}
        {Platform.OS !== 'web' && (
        <View style={styles.voiceArea}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.micBtn, recording && styles.micBtnRecording]}
              onPress={toggleRecording}
            >
              <Ionicons name={recording ? 'stop' : 'mic'} size={26} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.micLabel}>
              {recording ? '認識中... タップで停止' : '音声で入力'}
            </Text>
            <Text style={styles.micHint}>
              {recording ? '途中で止まっても待ちます' : '話すか直接テキスト入力'}
            </Text>
          </View>
        </View>
        )}

        {/* Claudeで整形ボタン */}
        {content.length > 0 && !formatting && !recording && (
          <TouchableOpacity style={styles.claudeBtn} onPress={formatWithClaude}>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={styles.claudeBtnText}>Claudeで整形</Text>
          </TouchableOpacity>
        )}
        {formatting && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.processingText}>整形中...</Text>
          </View>
        )}

        {/* テキスト入力 */}
        <TextInput
          style={styles.textArea}
          value={content}
          onChangeText={setContent}
          placeholder="音声入力後に表示されます。または直接入力"
          placeholderTextColor={Colors.placeholder}
          multiline
          textAlignVertical="top"
          editable={!recording}
        />

        {/* タグセクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>タグ</Text>
            {extractingTags && (
              <View style={styles.extractingRow}>
                <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                <Text style={styles.extractingText}>候補を生成中...</Text>
              </View>
            )}
          </View>

          {/* 選択済みタグ */}
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <TouchableOpacity key={tag} style={styles.tag} onPress={() => removeTag(tag)}>
                  <Text style={styles.tagText}>#{tag}</Text>
                  <Ionicons name="close" size={12} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 候補タグ */}
          {suggestedTags.length > 0 && (
            <View style={styles.suggestSection}>
              <Text style={styles.suggestLabel}>候補（タップで追加）</Text>
              <View style={styles.tagRow}>
                {suggestedTags.map((tag) => (
                  <TouchableOpacity key={tag} style={styles.suggestTag} onPress={() => addTag(tag)}>
                    <Ionicons name="add" size={13} color={Colors.textSecondary} />
                    <Text style={styles.suggestTagText}>#{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 手動入力 */}
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="手動で追加"
              placeholderTextColor={Colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={addInputTag}
            />
            <TouchableOpacity style={styles.tagAddBtn} onPress={addInputTag}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {/* リンクセクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>関連リンク</Text>
          </View>
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
        </View>
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
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, paddingBottom: 60 },
  dateLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, alignSelf: 'flex-start' },
  dateLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  datePickerDoneRow: { alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  datePickerDone: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  voiceArea: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  micBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  micBtnRecording: { backgroundColor: Colors.danger },
  micLabel: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  micHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  claudeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7C3AED', borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, alignSelf: 'flex-start',
  },
  claudeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  processingText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  textArea: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, fontSize: 16, color: Colors.text,
    minHeight: 180, lineHeight: 24,
  },
  section: { marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  extractingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  extractingText: { fontSize: 11, color: Colors.textMuted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: tint(Colors.primary, '18'), borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tagText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  suggestSection: { marginBottom: 8 },
  suggestLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
  suggestTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.card, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    paddingHorizontal: 10, paddingVertical: 4,
  },
  suggestTagText: { fontSize: 13, color: Colors.textSecondary },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text,
  },
  tagAddBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 10 },
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
    justifyContent: 'center',
  },
  addLinkText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
})
