import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Clipboard } from 'react-native'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import { Card } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

function parseCardMemo(memo: string | null): Record<string, string> {
  try { if (memo && memo.startsWith('{')) return JSON.parse(memo) } catch {}
  return { note: memo ?? '' }
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [card, setCard] = useState<Card | null>(null)
  const [editing, setEditing] = useState(false)
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
  const [revealed, setRevealed] = useState(false)
  const [revealedCvv, setRevealedCvv] = useState(false)
  const [revealedPin, setRevealedPin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('cards').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setCard(data as Card)
        setName(data.name)
        setCardNumber(data.card_number)
        const ex = parseCardMemo(data.memo)
        setOwner(ex.owner ?? '')
        setCvv(ex.cvv ?? '')
        setExpiry(ex.expiry ?? '')
        setCardholder(ex.cardholder ?? '')
        setPin(ex.pin ?? '')
        setBilling(ex.billing ?? '')
        setNote(ex.note ?? '')
      }
      setLoading(false)
    })

    const auth = getAuthStore()
    if (auth?.householdId) {
      supabase.from('households').select('members').eq('id', auth.householdId).single()
        .then(({ data }) => setMembers(data?.members ?? []))
    }
  }, [id])

  function maskNumber(num: string) {
    if (num.length <= 4) return num
    return num.slice(0, -4).replace(/[0-9a-zA-Z]/g, '•') + num.slice(-4)
  }

  function copyNumber() {
    if (!card) return
    Clipboard.setString(card.card_number)
    Alert.alert('コピーしました', 'カード番号をクリップボードにコピーしました')
  }

  async function saveEdit() {
    if (!name.trim()) { Alert.alert('入力エラー', 'カード名を入力してください'); return }
    if (!cardNumber.trim()) { Alert.alert('入力エラー', '番号を入力してください'); return }
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
      const { error } = await supabase.from('cards').update({
        name: name.trim(),
        card_number: cardNumber.trim(),
        memo: memoStr,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      setCard((prev) => prev ? { ...prev, name: name.trim(), card_number: cardNumber.trim(), memo: memoStr } : null)
      setEditing(false)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('削除', `「${card?.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('cards').delete().eq('id', id)
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

  if (!card) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text>カードが見つかりません</Text></View>
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
          <Text style={styles.navTitle}>{editing ? '編集' : card.name}</Text>
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
              {/* オーナー選択 */}
              {members.length > 0 && (
                <View style={styles.section}>
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
              <View style={styles.section}>
                <Text style={styles.label}>カード名</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} autoFocus={members.length === 0} />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>カード番号</Text>
                <TextInput style={styles.input} value={cardNumber} onChangeText={setCardNumber} keyboardType="default" />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>セキュリティコード (CVV)</Text>
                <TextInput style={styles.input} value={cvv} onChangeText={setCvv} keyboardType="number-pad" maxLength={4} secureTextEntry />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>有効期限</Text>
                <TextInput style={styles.input} value={expiry} onChangeText={setExpiry} placeholder="MM/YY" placeholderTextColor={Colors.placeholder} maxLength={5} />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>名義 (ローマ字)</Text>
                <TextInput style={styles.input} value={cardholder} onChangeText={setCardholder} autoCapitalize="characters" />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>暗証番号</Text>
                <TextInput style={styles.input} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4} secureTextEntry />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>引落口座</Text>
                <TextInput style={styles.input} value={billing} onChangeText={setBilling} />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>メモ</Text>
                <TextInput style={[styles.input, styles.inputMulti]} value={note} onChangeText={setNote} multiline textAlignVertical="top" />
              </View>
            </>
          ) : (() => {
            const ex = parseCardMemo(card.memo)
            return (
              <>
                {/* カード番号表示 */}
                <View style={styles.numberCard}>
                  <View style={styles.numberHeader}>
                    <Ionicons name="card-outline" size={18} color={Colors.primary} />
                    <Text style={styles.cardNameText}>{card.name}</Text>
                    {ex.owner ? (
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeText}>{ex.owner}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setRevealed(!revealed)} activeOpacity={0.7}>
                    <Text style={styles.numberText}>
                      {revealed ? card.card_number : maskNumber(card.card_number)}
                    </Text>
                    <Text style={styles.revealHint}>{revealed ? 'タップで隠す' : 'タップで表示'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.copyBtn} onPress={copyNumber}>
                    <Ionicons name="copy-outline" size={16} color="#fff" />
                    <Text style={styles.copyBtnText}>番号をコピー</Text>
                  </TouchableOpacity>
                </View>

                {ex.cvv ? (
                  <TouchableOpacity style={styles.section} onPress={() => setRevealedCvv(v => !v)} activeOpacity={0.7}>
                    <Text style={styles.label}>セキュリティコード</Text>
                    <Text style={styles.memoText}>{revealedCvv ? ex.cvv : '•••'}</Text>
                    <Text style={styles.revealHint}>{revealedCvv ? 'タップで隠す' : 'タップで表示'}</Text>
                  </TouchableOpacity>
                ) : null}
                {ex.expiry ? (
                  <View style={styles.section}>
                    <Text style={styles.label}>有効期限</Text>
                    <Text style={styles.memoText}>{ex.expiry}</Text>
                  </View>
                ) : null}
                {ex.cardholder ? (
                  <View style={styles.section}>
                    <Text style={styles.label}>名義</Text>
                    <Text style={styles.memoText}>{ex.cardholder}</Text>
                  </View>
                ) : null}
                {ex.pin ? (
                  <TouchableOpacity style={styles.section} onPress={() => setRevealedPin(v => !v)} activeOpacity={0.7}>
                    <Text style={styles.label}>暗証番号</Text>
                    <Text style={styles.memoText}>{revealedPin ? ex.pin : '••••'}</Text>
                    <Text style={styles.revealHint}>{revealedPin ? 'タップで隠す' : 'タップで表示'}</Text>
                  </TouchableOpacity>
                ) : null}
                {ex.billing ? (
                  <View style={styles.section}>
                    <Text style={styles.label}>引落口座</Text>
                    <Text style={styles.memoText}>{ex.billing}</Text>
                  </View>
                ) : null}
                {ex.note ? (
                  <View style={styles.section}>
                    <Text style={styles.label}>メモ</Text>
                    <Text style={styles.memoText}>{ex.note}</Text>
                  </View>
                ) : null}

                <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              </>
            )
          })()}
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
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 60 },
  numberCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  numberHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardNameText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  numberText: { fontSize: 22, fontWeight: '700', color: Colors.text, letterSpacing: 2, marginTop: 4 },
  revealHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start',
  },
  copyBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  section: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputMulti: { minHeight: 80, lineHeight: 22 },
  memoText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.danger, borderRadius: Radius.md,
    paddingVertical: 12, marginTop: 8,
  },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
  ownerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  ownerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ownerChipText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  ownerChipTextActive: { color: '#fff' },
  ownerBadge: {
    backgroundColor: Colors.primary + '20', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  ownerBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
})
