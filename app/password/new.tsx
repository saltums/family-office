import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import { Colors, Radius, Spacing } from '@/lib/theme'

export default function NewPasswordScreen() {
  const [siteName, setSiteName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [memo, setMemo] = useState('')
  const [owner, setOwner] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const auth = getAuthStore()
    if (auth?.householdId) {
      supabase.from('households').select('members').eq('id', auth.householdId).single()
        .then(({ data }) => setMembers(data?.members ?? []))
    }
  }, [])

  async function save() {
    if (!siteName.trim()) { Alert.alert('入力エラー', 'サービス名を入力してください'); return }
    if (!password.trim()) { Alert.alert('入力エラー', 'パスワードを入力してください'); return }

    const auth = getAuthStore()
    if (!auth?.userId || !auth?.householdId) {
      Alert.alert('エラー', 'ログアウトされています。再起動してください。')
      return
    }

    let memoStr: string | null = null
    if (owner.trim()) {
      const ex: Record<string, string> = { owner: owner.trim() }
      if (memo.trim()) ex.note = memo.trim()
      memoStr = JSON.stringify(ex)
    } else {
      memoStr = memo.trim() || null
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('passwords').insert({
        household_id: auth.householdId,
        created_by: auth.userId,
        site_name: siteName.trim(),
        url: url.trim() || null,
        username: username.trim() || null,
        password: password.trim(),
        memo: memoStr,
      })
      if (error) throw error
      router.back()
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>パスワードを追加</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>保存</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {members.length > 0 && (
            <View style={styles.card}>
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

          <View style={styles.card}>
            <Text style={styles.label}>サービス名 *</Text>
            <TextInput
              style={styles.input}
              value={siteName}
              onChangeText={setSiteName}
              placeholder="例：Amazon、楽天、電気代"
              placeholderTextColor={Colors.placeholder}
              autoFocus={members.length === 0}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>URL（任意）</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://..."
              placeholderTextColor={Colors.placeholder}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>ユーザー名・メールアドレス（任意）</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="login@example.com"
              placeholderTextColor={Colors.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>パスワード *</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="パスワード"
                placeholderTextColor={Colors.placeholder}
                secureTextEntry={!showPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} hitSlop={8}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>メモ（任意）</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={memo}
              onChangeText={setMemo}
              placeholder="秘密の質問、備考など"
              placeholderTextColor={Colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
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
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4 },
  inputMulti: { minHeight: 80, lineHeight: 22 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ownerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  ownerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ownerChipText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  ownerChipTextActive: { color: '#fff' },
})
