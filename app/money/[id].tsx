import React, { useCallback, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Switch, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@/components/DateTimePicker'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  MONEY_EVENT_TYPES, MONEY_EVENT_NEEDS_RETURN, MoneyEventType, MoneyRecord,
} from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

function toDateStr(d: Date) { return d.toISOString().slice(0, 10) }
function displayDate(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
function parseDateObj(str: string | null | undefined): Date {
  if (!str) return new Date()
  const d = new Date(str)
  return isNaN(d.getTime()) ? new Date() : d
}
function formatAmount(n: number) { return `¥${n.toLocaleString()}` }
function formatDateDisplay(s: string) {
  const d = new Date(s)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export default function MoneyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [record, setRecord] = useState<MoneyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [savingReturn, setSavingReturn] = useState(false)

  // edit state
  const [eventType, setEventType] = useState<MoneyEventType>('その他')
  const [direction, setDirection] = useState<'received' | 'given'>('received')
  const [dateObj, setDateObj] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [needsReturn, setNeedsReturn] = useState(false)
  const [returnStatus, setReturnStatus] = useState<'pending' | 'done' | null>(null)
  const [memo, setMemo] = useState('')

  // お返し記録 state
  const [returnNote, setReturnNote] = useState('')
  const [returnAmount, setReturnAmount] = useState('')
  const [returnDateObj, setReturnDateObj] = useState(new Date())
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false)

  // どの日付ピッカーが開いているか
  const [activePicker, setActivePicker] = useState<'main' | 'return'>('main')

  useFocusEffect(useCallback(() => {
    if (!id) return
    supabase.from('money_records').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return
        const r = data as MoneyRecord
        setRecord(r)
        setEventType(r.event_type)
        setDirection(r.direction)
        setDateObj(parseDateObj(r.date))
        setPerson(r.person)
        setAmount(String(r.amount))
        setNeedsReturn(r.needs_return)
        setReturnStatus(r.return_status)
        setMemo(r.memo ?? '')
        setReturnNote(r.return_note ?? '')
        setReturnAmount(r.return_amount ? String(r.return_amount) : '')
        setReturnDateObj(parseDateObj(r.return_date))
        setLoading(false)
      })
  }, [id]))

  function onEventTypeChange(t: MoneyEventType) {
    setEventType(t)
    setNeedsReturn(MONEY_EVENT_NEEDS_RETURN[t])
  }

  async function saveReturn() {
    setSavingReturn(true)
    const retAmtNum = returnAmount ? parseInt(returnAmount.replace(/,/g, ''), 10) : null
    const updates: Partial<MoneyRecord> = {
      return_status: 'done',
      return_note: returnNote.trim() || null,
      return_amount: retAmtNum && retAmtNum > 0 ? retAmtNum : null,
      return_date: toDateStr(returnDateObj),
      updated_at: new Date().toISOString(),
    }
    try {
      const { data, error } = await supabase.from('money_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setRecord(data as MoneyRecord)
      setReturnStatus('done')
      setShowReturnForm(false)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSavingReturn(false)
    }
  }

  async function save() {
    if (!person.trim()) { Alert.alert('入力エラー', '相手の名前を入力してください'); return }
    const amtNum = parseInt(amount.replace(/,/g, ''), 10)
    if (!amtNum || amtNum <= 0) { Alert.alert('入力エラー', '金額を入力してください'); return }

    setSaving(true)
    try {
      const { data, error } = await supabase.from('money_records')
        .update({
          event_type: eventType,
          direction,
          date: toDateStr(dateObj),
          person: person.trim(),
          amount: amtNum,
          needs_return: needsReturn,
          return_status: needsReturn ? (returnStatus ?? 'pending') : null,
          memo: memo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setRecord(data as MoneyRecord)
      setEditing(false)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord() {
    Alert.alert('削除', 'このメモを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          const { error } = await supabase.from('money_records').delete().eq('id', id)
          if (error) { Alert.alert('エラー', error.message); setDeleting(false); return }
          router.back()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }
  if (!record) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={{ color: Colors.textMuted }}>データが見つかりません</Text></View>
      </SafeAreaView>
    )
  }

  const isReturnPending = record.needs_return && record.return_status !== 'done'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{editing ? '編集' : '金銭メモ'}</Text>
          {editing ? (
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
              <Ionicons name="create-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {!editing ? (
            <>
              {/* ヘッダーカード */}
              <View style={styles.headerCard}>
                <View style={styles.headerTop}>
                  <View style={[styles.dirBadge, { backgroundColor: record.direction === 'received' ? '#10B98120' : '#EF444420' }]}>
                    <Ionicons
                      name={record.direction === 'received' ? 'arrow-down' : 'arrow-up'}
                      size={18}
                      color={record.direction === 'received' ? '#10B981' : '#EF4444'}
                    />
                    <Text style={[styles.dirBadgeText, { color: record.direction === 'received' ? '#10B981' : '#EF4444' }]}>
                      {record.direction === 'received' ? 'もらった' : 'あげた'}
                    </Text>
                  </View>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>{record.event_type}</Text>
                  </View>
                </View>
                <Text style={[styles.amountBig, { color: record.direction === 'received' ? '#10B981' : '#EF4444' }]}>
                  {record.direction === 'received' ? '+' : '-'}{formatAmount(record.amount)}
                </Text>
                <Text style={styles.personName}>{record.person}</Text>
                <Text style={styles.dateSmall}>{formatDateDisplay(record.date)}</Text>
              </View>

              {/* お返しセクション */}
              {record.needs_return && (
                <View style={styles.returnCard}>
                  <View style={styles.returnHeader}>
                    <Text style={styles.returnTitle}>お返し</Text>
                    <View style={[
                      styles.returnStatusBadge,
                      { backgroundColor: record.return_status === 'done' ? '#10B98120' : '#F59E0B20' },
                    ]}>
                      {record.return_status === 'done'
                        ? <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        : <Ionicons name="time-outline" size={14} color="#F59E0B" />}
                      <Text style={[
                        styles.returnStatusText,
                        { color: record.return_status === 'done' ? '#10B981' : '#F59E0B' },
                      ]}>
                        {record.return_status === 'done' ? '完了' : '未対応'}
                      </Text>
                    </View>
                  </View>

                  {/* 完了済みの場合：お返し詳細を表示 */}
                  {record.return_status === 'done' && (record.return_note || record.return_amount || record.return_date) && (
                    <View style={styles.returnDetails}>
                      {record.return_note ? (
                        <View style={styles.returnDetailRow}>
                          <Text style={styles.returnDetailLabel}>内容</Text>
                          <Text style={styles.returnDetailValue}>{record.return_note}</Text>
                        </View>
                      ) : null}
                      {record.return_amount ? (
                        <View style={styles.returnDetailRow}>
                          <Text style={styles.returnDetailLabel}>金額</Text>
                          <Text style={styles.returnDetailValue}>{formatAmount(record.return_amount)}</Text>
                        </View>
                      ) : null}
                      {record.return_date ? (
                        <View style={styles.returnDetailRow}>
                          <Text style={styles.returnDetailLabel}>日付</Text>
                          <Text style={styles.returnDetailValue}>{formatDateDisplay(record.return_date)}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* 未対応の場合：記録フォームまたは記録ボタン */}
                  {isReturnPending && !showReturnForm && (
                    <TouchableOpacity
                      style={styles.recordReturnBtn}
                      onPress={() => setShowReturnForm(true)}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                      <Text style={styles.recordReturnBtnText}>お返しを記録する</Text>
                    </TouchableOpacity>
                  )}

                  {/* お返し記録フォーム */}
                  {showReturnForm && (
                    <View style={styles.returnForm}>
                      <View style={styles.returnFormDivider} />

                      <Text style={styles.returnFormLabel}>何をあげたか</Text>
                      <TextInput
                        style={styles.returnFormInput}
                        value={returnNote}
                        onChangeText={setReturnNote}
                        placeholder="例：カタログギフト、商品券など"
                        placeholderTextColor={Colors.placeholder}
                        multiline
                      />

                      <Text style={[styles.returnFormLabel, { marginTop: 12 }]}>金額（任意）</Text>
                      <TextInput
                        style={styles.returnFormInput}
                        value={returnAmount}
                        onChangeText={setReturnAmount}
                        placeholder="例：5000"
                        placeholderTextColor={Colors.placeholder}
                        keyboardType="numeric"
                      />

                      <Text style={[styles.returnFormLabel, { marginTop: 12 }]}>日付</Text>
                      <TouchableOpacity
                        style={styles.dateRow}
                        onPress={() => {
                          setActivePicker('return')
                          setShowReturnDatePicker(true)
                        }}
                      >
                        <Text style={styles.dateText}>{displayDate(returnDateObj)}</Text>
                        <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                      {Platform.OS !== 'ios' && showReturnDatePicker && (
                        <DateTimePicker
                          value={returnDateObj}
                          mode="date"
                          display="default"
                          onChange={(_, d) => {
                            setShowReturnDatePicker(false)
                            if (d) setReturnDateObj(d)
                          }}
                        />
                      )}

                      <View style={styles.returnFormActions}>
                        <TouchableOpacity
                          style={styles.returnFormCancel}
                          onPress={() => setShowReturnForm(false)}
                        >
                          <Text style={styles.returnFormCancelText}>キャンセル</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.returnFormSave, savingReturn && { opacity: 0.5 }]}
                          onPress={saveReturn}
                          disabled={savingReturn}
                        >
                          {savingReturn
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.returnFormSaveText}>完了として保存</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* 完了済みで再編集ボタン */}
                  {record.return_status === 'done' && (
                    <TouchableOpacity
                      style={styles.editReturnBtn}
                      onPress={() => {
                        setReturnNote(record.return_note ?? '')
                        setReturnAmount(record.return_amount ? String(record.return_amount) : '')
                        setReturnDateObj(parseDateObj(record.return_date))
                        setShowReturnForm(true)
                      }}
                    >
                      <Ionicons name="create-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.editReturnBtnText}>お返し内容を編集</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* メモ */}
              {record.memo ? (
                <View style={styles.card}>
                  <Text style={styles.memoLabel}>メモ</Text>
                  <Text style={styles.memoText}>{record.memo}</Text>
                </View>
              ) : null}

              {/* 削除 */}
              <TouchableOpacity
                style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
                onPress={deleteRecord}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#EF4444" size="small" />
                  : <Text style={styles.deleteBtnText}>このメモを削除</Text>}
              </TouchableOpacity>
            </>
          ) : (
            /* 編集モード */
            <>
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

              <View style={styles.card}>
                <Text style={styles.label}>相手</Text>
                <TextInput
                  style={styles.input}
                  value={person}
                  onChangeText={setPerson}
                  placeholder="例：田中さん"
                  placeholderTextColor={Colors.placeholder}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>日付</Text>
                <TouchableOpacity
                  style={styles.dateRow}
                  onPress={() => {
                    setActivePicker('main')
                    setShowDatePicker(true)
                  }}
                >
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

              <View style={styles.card}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>お返しが必要</Text>
                  </View>
                  <Switch
                    value={needsReturn}
                    onValueChange={v => {
                      setNeedsReturn(v)
                      if (!v) setReturnStatus(null)
                      else if (!returnStatus) setReturnStatus('pending')
                    }}
                    trackColor={{ true: '#10B981' }}
                    thumbColor="#fff"
                  />
                </View>
                {needsReturn && (
                  <View style={styles.returnStatusToggle}>
                    <TouchableOpacity
                      style={[styles.statusBtn, returnStatus !== 'done' && styles.statusBtnPending]}
                      onPress={() => setReturnStatus('pending')}
                    >
                      <Text style={[styles.statusBtnText, returnStatus !== 'done' && { color: '#F59E0B' }]}>未対応</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.statusBtn, returnStatus === 'done' && styles.statusBtnDone]}
                      onPress={() => setReturnStatus('done')}
                    >
                      <Text style={[styles.statusBtnText, returnStatus === 'done' && { color: '#10B981' }]}>完了</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>メモ（任意）</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="品物の内容など"
                  placeholderTextColor={Colors.placeholder}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS date picker modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showDatePicker || showReturnDatePicker}
          transparent
          animationType="slide"
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => {
                  setShowDatePicker(false)
                  setShowReturnDatePicker(false)
                }}>
                  <Text style={styles.pickerDone}>完了</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={activePicker === 'return' ? returnDateObj : dateObj}
                mode="date"
                display="spinner"
                onChange={(_, d) => {
                  if (!d) return
                  if (activePicker === 'return') setReturnDateObj(d)
                  else setDateObj(d)
                }}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: '#10B981', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 60 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  headerCard: {
    backgroundColor: Colors.card, borderRadius: Radius.xl,
    padding: 20, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: 8,
  },
  headerTop: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between' },
  dirBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  dirBadgeText: { fontSize: 13, fontWeight: '700' },
  eventBadge: { backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  eventBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  amountBig: { fontSize: 36, fontWeight: '800', marginTop: 8 },
  personName: { fontSize: 20, fontWeight: '700', color: Colors.text },
  dateSmall: { fontSize: 13, color: Colors.textMuted },
  // お返しカード
  returnCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: '#F59E0B60',
  },
  returnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  returnTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  returnStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  returnStatusText: { fontSize: 12, fontWeight: '700' },
  returnDetails: { gap: 6, marginBottom: 8 },
  returnDetailRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  returnDetailLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, width: 36 },
  returnDetailValue: { fontSize: 14, color: Colors.text, flex: 1 },
  recordReturnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: tint(Colors.primary, '12'), borderRadius: Radius.md,
    marginTop: 4,
  },
  recordReturnBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  returnForm: { gap: 4 },
  returnFormDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  returnFormLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  returnFormInput: {
    fontSize: 15, color: Colors.text, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  returnFormActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  returnFormCancel: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  returnFormCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  returnFormSave: {
    flex: 2, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: '#10B981', alignItems: 'center',
  },
  returnFormSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  editReturnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, alignSelf: 'flex-start',
  },
  editReturnBtnText: { fontSize: 12, color: Colors.textMuted },
  // メモ
  memoLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase' },
  memoText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  deleteBtn: {
    marginTop: 8, padding: 14, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: '#EF4444', alignItems: 'center',
  },
  deleteBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
  // edit mode
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
  chipActive: { backgroundColor: tint(Colors.primary, '18'), borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  returnStatusToggle: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statusBtn: {
    flex: 1, paddingVertical: 8, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  statusBtnPending: { borderColor: '#F59E0B', backgroundColor: '#F59E0B18' },
  statusBtnDone: { borderColor: '#10B981', backgroundColor: '#10B98118' },
  statusBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  cancelBtn: {
    padding: 14, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
  pickerOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerDone: { fontSize: 16, fontWeight: '700', color: Colors.primary },
})
