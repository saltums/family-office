import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Clipboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import { PasswordEntry } from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

function parseMemo(memo: string | null): Record<string, string> {
  try { if (memo && memo.startsWith('{')) return JSON.parse(memo) } catch {}
  return { note: memo ?? '' }
}

export default function PasswordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [entry, setEntry] = useState<PasswordEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [memo, setMemo] = useState('')
  const [owner, setOwner] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('passwords').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        const d = data as PasswordEntry
        setEntry(d)
        setSiteName(d.site_name)
        setUrl(d.url ?? '')
        setUsername(d.username ?? '')
        setPassword(d.password)
        const ex = parseMemo(d.memo)
        setOwner(ex.owner ?? '')
        setMemo(ex.note ?? '')
      }
      setLoading(false)
    })

    const auth = getAuthStore()
    if (auth?.householdId) {
      supabase.from('households').select('members').eq('id', auth.householdId).single()
        .then(({ data }) => setMembers(data?.members ?? []))
    }
  }, [id])

  function copy(text: string, label: string) {
    Clipboard.setString(text)
    Alert.alert('コピーしました', `${label}をクリップボードにコピーしました`)
  }

  async function saveEdit() {
    if (!siteName.trim()) { Alert.alert('入力エラー', 'サービス名を入力してください'); return }
    if (!password.trim()) { Alert.alert('入力エラー', 'パスワードを入力してください'); return }
    setSaving(true)
    try {
      let memoStr: string | null = null
      if (owner.trim()) {
        const ex: Record<string, string> = { owner: owner.trim() }
        if (memo.trim()) ex.note = memo.trim()
        memoStr = JSON.stringify(ex)
      } else {
        memoStr = memo.trim() || null
      }
      const { error } = await supabase.from('passwords').update({
        site_name: siteName.trim(),
        url: url.trim() || null,
        username: username.trim() || null,
        password: password.trim(),
        memo: memoStr,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      setEntry((prev) => prev ? {
        ...prev,
        site_name: siteName.trim(),
        url: url.trim() || null,
        username: username.trim() || null,
        password: password.trim(),
        memo: memoStr,
      } : null)
      setEditing(false)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('削除', `「${entry?.site_name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('passwords').delete().eq('id', id)
          router.back()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text>データが見つかりません</Text></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{editing ? '編集' : entry.site_name}</Text>
          {editing ? (
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={saveEdit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
              <Ionicons name="pencil-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {editing ? (
            <>
              {members.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.label}>誰のもの</Text>
                  <View style={styles.ownerRow}>
                    {members.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.ownerChip, owner === m && styles.ownerChipActive]}
                        onPress={() => setOwner(owner === m ? '' : m)}
                      >
                        <Text style={[styles.ownerChipText, owner === m && styles.ownerChipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={styles.section}>
                <Text style={styles.label}>サービス名</Text>
                <TextInput style={styles.input} value={siteName} onChangeText={setSiteName} autoFocus={members.length === 0} />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>URL</Text>
                <TextInput style={styles.input} value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>ユーザー名・メールアドレス</Text>
                <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>パスワード</Text>
                <View style={styles.pwRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPw(!showPw)} hitSlop={8}>
                    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>メモ</Text>
                <TextInput style={[styles.input, styles.inputMulti]} value={memo} onChangeText={setMemo} multiline textAlignVertical="top" />
              </View>
            </>
          ) : (
            <>
              {/* メインカード */}
              <View style={styles.mainCard}>
                <View style={styles.mainCardHeader}>
                  <View style={styles.siteIcon}>
                    <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.siteName}>{entry.site_name}</Text>
                    {entry.url ? <Text style={styles.siteUrl} numberOfLines={1}>{entry.url}</Text> : null}
                  </View>
                  {owner ? (
                    <View style={styles.ownerBadge}>
                      <Text style={styles.ownerBadgeText}>{owner}</Text>
                    </View>
                  ) : null}
                </View>

                {/* ユーザー名 */}
                {entry.username ? (
                  <View style={styles.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>ユーザー名</Text>
                      <Text style={styles.fieldValue}>{entry.username}</Text>
                    </View>
                    <TouchableOpacity onPress={() => copy(entry.username!, 'ユーザー名')} style={styles.copyIconBtn} hitSlop={8}>
                      <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* パスワード */}
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>パスワード</Text>
                    <TouchableOpacity onPress={() => setShowPw(!showPw)} activeOpacity={0.7}>
                      <Text style={styles.fieldValue}>
                        {showPw ? entry.password : '•'.repeat(Math.min(entry.password.length, 12))}
                      </Text>
                      <Text style={styles.revealHint}>{showPw ? 'タップで隠す' : 'タップで表示'}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => copy(entry.password, 'パスワード')} style={styles.copyIconBtn} hitSlop={8}>
                    <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              {memo ? (
                <View style={styles.section}>
                  <Text style={styles.label}>メモ</Text>
                  <Text style={styles.memoText}>{memo}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={styles.deleteBtnText}>削除</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 60 },
  mainCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  mainCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  siteIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: tint(Colors.primary, '18'), alignItems: 'center', justifyContent: 'center',
  },
  siteName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  siteUrl: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { fontSize: 16, color: Colors.text, fontFamily: 'monospace' },
  revealHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  copyIconBtn: { padding: 4 },
  section: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputMulti: { minHeight: 80, lineHeight: 22 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memoText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  ownerBadge: {
    backgroundColor: tint(Colors.primary, '22'), borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  ownerBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  ownerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  ownerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ownerChipText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  ownerChipTextActive: { color: '#fff' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.danger, borderRadius: Radius.md,
    paddingVertical: 12, marginTop: 8,
  },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
})
