import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Switch, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@/components/DateTimePicker'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import {
  MONEY_EVENT_TYPES, MONEY_EVENT_NEEDS_RETURN, MoneyEventType,
} from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}
function displayDate(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function NewMoneyScreen() {
  const [eventType, setEventType] = useState<MoneyEventType>('その他')
  const [direction, setDirection] = useState<'received' | 'given'>('received')
  const [dateObj, setDateObj] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [needsReturn, setNeedsReturn] = useState(false)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  function onEventTypeChange(t: MoneyEventType) {
    setEventType(t)
    setNeedsReturn(MONEY_EVENT_NEEDS_RETURN[t])
  }

  async function save() {
    if (!person.trim()) { Alert.alert('入力エラー', '相手の名前を入力してください'); return }
    const amtNum = parseInt(amount.replace(/,/g, ''), 10)
    if (!amtNum || amtNum <= 0) { Alert.alert('入力エラー', '金額を入力してください'); return }

    const auth = getAuthStore()
    if (!auth?.userId || !auth?.householdId) {
      Alert.alert('エラー', 'ログアウトされています。再起動してください。')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('money_records').insert({
        household_id: auth.householdId,
        created_by: auth.userId,
        event_type: eventType,
        direction,
        date: toDateStr(dateObj),
        person: person.trim(),
        amount: amtNum,
        needs_return: needsReturn,
        return_status: needsReturn ? 'pending' : null,
        memo: memo.trim() || null,
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
          <Text style={styles.navTitle}>金銭メモを追加</Text>
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
          {/* もらった/あげた */}
          <View style={styles.card}>
            <View style={styles.dirToggle}>
              <TouchableOpacity
                style={[styles.dirBtn, direction === 'received' && styles.dirBtnReceived]}
                onPress={() => setDirection('received')}
              >
                <Ionicons name="arrow-down" size={16} color={direction === 'received' ? '#fff' : Colors.textMuted} />
                <Text style={[styles.dirBtnText, direction === 'received' && { color: '#fff' }]}>もらった</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dirBtn, direction === 'given' && styles.dirBtnGiven]}
                onPress={() => setDirection('given')}
              >
                <Ionicons name="arrow-up" size={16} color={direction === 'given' ? '#fff' : Colors.textMuted} />
                <Text style={[styles.dirBtnText, direction === 'given' && { color: '#fff' }]}>あげた</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* イベント種別 */}
          <View style={styles.card}>
            <Text style={styles.label}>種別</Text>
            <View style={styles.chipGrid}>
              {MONEY_EVENT_TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, eventType === t && styles.chipActive]}
                  onPress={() => onEventTypeChange(t)}
                >
                  <Text style={[styles.chipText, eventType === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 相手 */}
          <View style={styles.card}>
            <Text style={styles.label}>相手</Text>
            <TextInput
              style={styles.input}
              value={person}
              onChangeText={setPerson}
              placeholder="例：田中さん、山田家"
              placeholderTextColor={Colors.placeholder}
            />
          </View>

          {/* 日付 */}
          <View style={styles.card}>
            <Text style={styles.label}>日付</Text>
            <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateText}>{displayDate(dateObj)}</Text>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            {Platform.OS !== 'ios' && showDatePicker && (
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="default"
                onChange={(_, d) => {
                  setShowDatePicker(false)
                  if (d) setDateObj(d)
                }}
              />
            )}
          </View>

          {/* 金額 */}
          <View style={styles.card}>
            <Text style={styles.label}>金額</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="例：10000"
              placeholderTextColor={Colors.placeholder}
              keyboardType="numeric"
            />
          </View>

          {/* お返し要否 */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>お返しが必要</Text>
                <Text style={styles.switchDesc}>内祝い・香典返しなど</Text>
              </View>
              <Switch
                value={needsReturn}
                onValueChange={setNeedsReturn}
                trackColor={{ true: '#10B981' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* メモ */}
          <View style={styles.card}>
            <Text style={styles.label}>メモ（任意）</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={memo}
              onChangeText={setMemo}
              placeholder="品物の内容、お礼の言葉など"
              placeholderTextColor={Colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS date picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerDone}>完了</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="spinner"
                onChange={(_, d) => { if (d) setDateObj(d) }}
                locale="ja"
              />
            </View>
          </View>
        </Modal>
      )}
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
  saveBtn: { backgroundColor: '#10B981', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputMulti: { minHeight: 80, lineHeight: 22 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  dateText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  dirToggle: { flexDirection: 'row', gap: 8 },
  dirBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  dirBtnReceived: { backgroundColor: '#10B981', borderColor: '#10B981' },
  dirBtnGiven: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  dirBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  chipActive: { backgroundColor: Colors.primary + '18', borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  switchDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  pickerOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerDone: { fontSize: 16, fontWeight: '700', color: Colors.primary },
})
