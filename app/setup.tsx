import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { setAuthStore } from '@/lib/authStore'
import { writeAuthCache, writeDeviceHid } from '@/lib/authCache'
import { Colors, Radius, Spacing } from '@/lib/theme'

export default function SetupScreen() {
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)

  async function createHousehold() {
    if (!householdName.trim()) {
      Alert.alert('入力エラー', 'お名前を入力してください（例：山田家）')
      return
    }

    setLoading(true)
    try {
      // セッションがなければ先に匿名サインイン（session=nullでsetupに来た場合）
      let sess = (await supabase.auth.getSession()).data.session
      if (!sess) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) throw new Error('認証に失敗しました: ' + signInError.message)
        sess = data.session
      }
      if (!sess?.user.id) throw new Error('認証に失敗しました。しばらく待ってから再試行してください。')

      const { data: householdId, error } = await supabase
        .rpc('create_household_for_user', { household_name: householdName.trim() })

      if (error) throw error

      // デバイス永続household_idを保存（セッション期限切れ後の自動再参加用）
      await writeDeviceHid(householdId as string)

      // authStoreとcacheを即書き込み
      setAuthStore(sess.user.id, householdId as string)
      await writeAuthCache(sess.user.id, householdId as string)

      router.replace('/(main)/')
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>ようこそ</Text>
            <Text style={styles.subtitle}>はじめに、世帯のお名前を決めましょう</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>世帯名</Text>
            <TextInput
              style={styles.input}
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="例：山田家"
              placeholderTextColor={Colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={createHousehold}
              autoFocus
            />
            <Text style={styles.hint}>あとで変更することもできます</Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={createHousehold}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>世帯を作成する</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.joinLink} onPress={() => router.push('/join')}>
            <Text style={styles.joinText}>招待コードをお持ちの方はこちら</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  header: { marginBottom: Spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginTop: 6, lineHeight: 22 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    fontSize: 20,
    color: Colors.text,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  joinLink: { alignItems: 'center', marginTop: Spacing.md, padding: Spacing.sm },
  joinText: { color: Colors.primary, fontSize: 14 },
})
