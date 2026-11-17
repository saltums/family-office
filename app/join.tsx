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
import { writeDeviceHid, writeAuthCache } from '@/lib/authCache'
import { setAuthStore } from '@/lib/authStore'
import { Colors, Radius, Spacing } from '@/lib/theme'

export default function JoinScreen() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function joinHousehold() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      Alert.alert('入力エラー', '招待コードを入力してください')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const { data: invite, error: invErr } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', trimmed)
        .is('used_at', null)
        .gte('expires_at', new Date().toISOString())
        .single()

      if (invErr || !invite) {
        Alert.alert('エラー', '招待コードが無効または期限切れです')
        return
      }

      const { error: mErr } = await supabase
        .from('household_members')
        .insert({ household_id: invite.household_id, user_id: user.id })

      if (mErr) throw mErr

      await supabase
        .from('invite_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', invite.id)

      // デバイス永続household_idを保存 + authStore即書き込み
      await writeDeviceHid(invite.household_id)
      if (user?.id) {
        setAuthStore(user.id, invite.household_id)
        await writeAuthCache(user.id, invite.household_id)
      }

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
          {Platform.OS === 'web' ? (
            <TouchableOpacity style={styles.back} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.backText}>ログアウト</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.back} onPress={() => router.back()}>
              <Text style={styles.backText}>← 戻る</Text>
            </TouchableOpacity>
          )}

          <View style={styles.header}>
            <Text style={styles.title}>世帯に参加</Text>
            <Text style={styles.subtitle}>パートナーから受け取った招待コードを入力してください</Text>
          </View>

          <View style={styles.card}>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="例：ABCD-1234"
              placeholderTextColor={Colors.placeholder}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={joinHousehold}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={joinHousehold}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>参加する</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  back: { position: 'absolute', top: Spacing.lg, left: Spacing.lg, padding: Spacing.sm },
  backText: { color: Colors.primary, fontSize: 16 },
  header: { marginBottom: Spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginTop: 6, lineHeight: 22 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    letterSpacing: 4,
    paddingVertical: 12,
    width: '100%',
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
