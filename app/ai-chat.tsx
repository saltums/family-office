import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import Voice from '@/lib/voice'
import { supabase } from '@/lib/supabase'
import { readAuthCache, writeAuthCache } from '@/lib/authCache'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

type SourceItem = { type: 'diary'; date: string; excerpt?: string } | { type: 'record'; name: string }

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
  loading?: boolean
}

export default function AIChatScreen() {
  const { uid: paramUid, hid: paramHid } = useLocalSearchParams<{ uid: string; hid: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [recording, setRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  useEffect(() => {
    Voice.onSpeechStart = () => setRecording(true)
    Voice.onSpeechResults = (e) => {
      const text = e.value?.[0] ?? ''
      if (text) setInput(text)
    }
    Voice.onSpeechPartialResults = (e) => setInput(e.value?.[0] ?? '')
    Voice.onSpeechEnd = () => setRecording(false)
    Voice.onSpeechError = () => setRecording(false)
    return () => { Voice.destroy().then(Voice.removeAllListeners) }
  }, [])

  async function toggleRecording() {
    if (recording) { await Voice.stop(); return }
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('マイクの許可が必要です')
        return
      }
    }
    setInput('')
    try { await Voice.start('ja-JP') } catch {}
  }

  async function send() {
    const q = input.trim()
    if (!q || sending) return
    setInput('')

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q }
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true }
    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setSending(true)

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)

    const history = messages.slice(-20).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      let finalUid: string | null = null
      let finalHid: string | null = null

      // Step 1: params（最優先）
      if (paramUid && paramHid) { finalUid = paramUid; finalHid = paramHid }

      // Step 2: キャッシュ
      if (!finalUid || !finalHid) {
        const cached = await readAuthCache()
        if (cached?.userId && cached?.householdId) { finalUid = cached.userId; finalHid = cached.householdId }
      }

      // Step 3: getSession フォールバック
      if (!finalUid || !finalHid) {
        const { data: { session } } = await supabase.auth.getSession()
        const uid2 = session?.user.id
        if (!uid2) throw new Error('認証エラー。アプリを再起動してください。')
        const { data: hm } = await supabase.from('household_members').select('household_id').eq('user_id', uid2).single()
        if (!hm?.household_id) throw new Error('世帯情報が見つかりません。')
        finalUid = uid2; finalHid = hm.household_id
        writeAuthCache(uid2, hm.household_id)
      }

      const uid = finalUid!
      const hid = finalHid!

      const { data, error } = await supabase.functions.invoke('ask-ai', {
        body: { question: q, household_id: hid, user_id: uid, history },
      })
      if (error) throw error
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer ?? '回答を取得できませんでした',
        sources: data.sources ?? [],
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== 'loading'), assistantMsg])
    } catch (e: any) {
      Alert.alert('送信エラー', String(e?.message ?? e))
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== 'loading'),
        { id: (Date.now() + 1).toString(), role: 'assistant', content: `エラー: ${String(e?.message ?? e)}` },
      ])
    } finally {
      setSending(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isUser = item.role === 'user'
    if (item.loading) {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )
    }
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>{item.content}</Text>
          {!isUser && item.sources && item.sources.length > 0 && (
            <View style={styles.sources}>
              <Text style={styles.sourcesLabel}>参照:</Text>
              {item.sources.map((s, i) => (
                <Text key={i} style={styles.sourceItem}>
                  {s.type === 'diary'
                    ? `📖 ${s.date}の日記${s.excerpt ? ` — ${s.excerpt}` : ''}`
                    : `📋 ${(s as { type: 'record'; name: string }).name}`}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Ionicons name="sparkles" size={16} color={Colors.primary} />
          <Text style={styles.navTitle}>AIアシスタント</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>家族のAIアシスタント</Text>
            <Text style={styles.emptyBody}>日記・記録・タスクについて話しかけてみてください</Text>
            <View style={styles.suggestions}>
              {[
                '最近どんなことがあった？',
                '来月期限のものは？',
                '保険の更新はいつ？',
              ].map((s) => (
                <TouchableOpacity key={s} style={styles.suggestion} onPress={() => { setInput(s) }}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={[styles.micBtn, recording && styles.micBtnActive]}
            onPress={toggleRecording}
            disabled={sending}
          >
            <Ionicons name={recording ? 'stop' : 'mic-outline'} size={22} color={recording ? '#fff' : Colors.textSecondary} />
          </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="質問を入力..."
            placeholderTextColor={Colors.placeholder}
            multiline
            maxLength={500}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  navCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  list: { padding: Spacing.md, paddingBottom: 16 },
  listEmpty: { flex: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '80%', borderRadius: Radius.lg, padding: 12,
  },
  userBubble: { backgroundColor: Colors.primary },
  assistantBubble: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
  },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  sources: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  sourcesLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  sourceItem: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 40 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: tint(Colors.primary, '18'), alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  suggestions: { gap: 8, width: '100%' },
  suggestion: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  suggestionText: { fontSize: 14, color: Colors.text },
  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  input: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  loadingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  loadingBarText: { fontSize: 12, color: Colors.textMuted },
  connectingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  connectingText: { fontSize: 12, color: Colors.textMuted },
})
