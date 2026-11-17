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

export default function NewCardScreen() {
  const [name, setName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cvv, setCvv] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cardholder, setCardholder] = useState('')
  const [pin, setPin] = useState('')
  const [billing, setBilling] = useState('')
  const [note, setNote] = useState('')
  const [owner, setOwner] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const auth = getAuthStore()
    if (auth?.householdId) {
      supabase.from('households').select('members').eq('id', auth.householdId).single()
        .then(({ data }) => setMembers(data?.members ?? []))
    }
  }, [])

  async function save() {
    if (!name.trim()) { Alert.alert('入力エラー', 'カード名を入力してください'); return }
    if (!cardNumber.trim()) { Alert.alert('入力エラー', '番号を入力してください'); return }

    const auth = getAuthStore()
    if (!auth?.userId || !auth?.householdId) {
      Alert.alert('エラー', 'ログアウトされています。再起動してください.')
      return
    }

    const ex: Record<string, string> = {}
    if (owner.trim()) ex.owner = owner.trim()
    if (cvv.trim()) ex.cvv = cvv.trim()
    if (expiry.trim()) ex.expiry = expiry.trim()
    if (cardholder.trim()) ex.cardholder = cardholder.trim()
    if (pin.trim()) ex.pin = pin.trim()
    if (billing.trim()) ex.billing = billing.trim()
    if (note.trim()) ex.note = note.trim()
    const memoStr = Object.keys(ex).length ? JSON.stringify(ex) : null

    setSaving(true)
    try {
      const { error } = await supabase.from('cards').insert({
        household_id: auth.householdId,
        created_by: auth.userId,
        name: name.trim(),
        card_number: cardNumber.trim(),
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
          <Text style={styles.navTitle}>カードを追加</Text>
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
          {/* 誰のカード */}
          {members.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.label}>誰のカード</Text>
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
            <Text style={styles.label}>カード名 *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例：楽天カード、Suica"
              placeholderTextColor={Colors.placeholder}
              autoFocus={members.length === 0}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>番号 *</Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="カード番号・会員番号"
              placeholderTextColor={Colors.placeholder}
              keyboardType="default"
            />
            <Text style={styles.hint}>ハイフンや空白はそのまま入力できます</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>セキュリティコード (CVV)</Text>
            <TextInput style={styles.input} value={cvv} onChangeText={setCvv}
              placeholder="3〜4桁" placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad" maxLength={4} secureTextEntry />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>有効期限</Text>
            <TextInput style={styles.input} value={expiry} onChangeText={setExpiry}
              placeholder="MM/YY" placeholderTextColor={Colors.placeholder} maxLength={5} />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>名義 (ローマ字)</Text>
            <TextInput style={styles.input} value={cardholder} onChangeText={setCardholder}
              placeholder="TARO YAMADA" placeholderTextColor={Colors.placeholder}
              autoCapitalize="characters" />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>暗証番号</Text>
            <TextInput style={styles.input} value={pin} onChangeText={setPin}
              placeholder="4桁" placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad" maxLength={4} secureTextEntry />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>引落口座</Text>
            <TextInput style={styles.input} value={billing} onChangeText={setBilling}
              placeholder="例：三菱UFJ銀行" placeholderTextColor={Colors.placeholder} />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>メモ（任意）</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={note} onChangeText={setNote}
              placeholder="限度額・用途など" placeholderTextColor={Colors.placeholder}
              multiline textAlignVertical="top" />
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
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  ownerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  ownerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ownerChipText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  ownerChipTextActive: { color: '#fff' },
})
