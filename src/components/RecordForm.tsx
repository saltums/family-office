import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import DateTimePicker from '@/components/DateTimePicker'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { appendImageFile } from '@/lib/formFile'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import {
  ExpirationRecord, Category, TaskType,
  CATEGORIES, CATEGORY_COLORS, TASK_TYPES, TASK_TYPE_COLORS, TASK_TYPE_ICONS,
  hasStartDate, expirationLabel, startDateLabel,
} from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

const ALL_CATEGORIES: Category[] = ['タスク', ...CATEGORIES]

interface Props {
  mode: 'create' | 'edit'
  recordId?: string
  defaultCategory?: Category
}

type DateField = 'start' | 'expiration'

export default function RecordForm({ mode, recordId, defaultCategory }: Props) {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>(defaultCategory ?? 'その他')
  const [taskType, setTaskType] = useState<TaskType>('その他')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [expirationDate, setExpirationDate] = useState(new Date())
  const [owner, setOwner] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [contact, setContact] = useState('')
  const [memo, setMemo] = useState('')
  const [reminderDays, setReminderDays] = useState('30')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [existingFileId, setExistingFileId] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [activeDateField, setActiveDateField] = useState<DateField>('expiration')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(mode === 'edit')

  useEffect(() => {
    if (mode === 'edit' && recordId) {
      supabase
        .from('records')
        .select('*')
        .eq('id', recordId)
        .single()
        .then(({ data }) => {
          if (data) {
            setName(data.name)
            setCategory(data.category)
            if (data.task_type) setTaskType(data.task_type)
            setExpirationDate(new Date(data.expiration_date))
            if (data.start_date) setStartDate(new Date(data.start_date))
            setOwner(data.owner ?? null)
            setAmount(data.amount != null ? String(data.amount) : '')
            setContact(data.contact ?? '')
            setMemo(data.memo ?? '')
            setReminderDays(data.reminder_days_before != null ? String(data.reminder_days_before) : 'none')
            setExistingFileId(data.pcloud_file_id)
          }
          setLoading(false)
        })
    }
  }, [mode, recordId])

  function openDatePicker(field: DateField) {
    setActiveDateField(field)
    setShowDatePicker(true)
  }

  function onDateChange(_: any, date?: Date) {
    if (Platform.OS !== 'ios') setShowDatePicker(false)
    if (!date) return
    if (activeDateField === 'start') setStartDate(date)
    else setExpirationDate(date)
  }

  function currentPickerDate() {
    if (activeDateField === 'start') return startDate ?? new Date()
    return expirationDate
  }

  function formatDateLabel(d: Date | null) {
    if (!d) return '未設定'
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      )
      setImageUri(resized.uri)
    }
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageUri) return existingFileId
    const formData = new FormData()
    await appendImageFile(formData, 'file', imageUri, 'attachment.jpg')
    const { data, error } = await supabase.functions.invoke('upload-attachment', { body: formData })
    if (error || !data?.fileid) {
      Alert.alert('警告', '画像のアップロードに失敗しました。データは保存します。')
      return existingFileId
    }
    return String(data.fileid)
  }

  async function save() {
    if (!name.trim()) {
      Alert.alert('入力エラー', '項目名を入力してください')
      return
    }
    if (!household || !userId) return

    setSaving(true)
    try {
      const fileId = await uploadImage()
      const payload = {
        household_id: household.id,
        name: name.trim(),
        category,
        task_type: category === 'タスク' ? taskType : null,
        start_date: hasStartDate(category) && startDate
          ? startDate.toISOString().split('T')[0]
          : null,
        expiration_date: expirationDate.toISOString().split('T')[0],
        owner: owner ?? null,
        amount: amount ? parseFloat(amount) : null,
        contact: contact.trim() || null,
        memo: memo.trim() || null,
        pcloud_file_id: fileId,
        reminder_days_before: reminderDays === 'none' ? null : (parseInt(reminderDays) ?? null),
      }

      if (mode === 'create') {
        const { error } = await supabase.from('records').insert({ ...payload, created_by: userId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('records').update(payload).eq('id', recordId)
        if (error) throw error
      }

      router.back()
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      {/* 項目名 */}
      <View style={styles.field}>
        <Text style={styles.label}>項目名 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={category === 'タスク' ? '例：牛乳を買う、役所に電話' : '例：生命保険、パスポート'}
          placeholderTextColor={Colors.placeholder}
          returnKeyType="next"
        />
      </View>

      {/* カテゴリ */}
      <View style={styles.field}>
        <Text style={styles.label}>カテゴリ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {ALL_CATEGORIES.map((c) => {
              const selected = category === c
              const color = CATEGORY_COLORS[c]
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, selected && { backgroundColor: color }, !selected && { borderColor: color, borderWidth: 1.5 }]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.chipText, { color: selected ? '#fff' : color }]}>{c}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>
      </View>

      {/* タスク種別（タスク選択時のみ） */}
      {category === 'タスク' && (
        <View style={styles.field}>
          <Text style={styles.label}>種別</Text>
          <View style={styles.taskTypeGrid}>
            {TASK_TYPES.map((t) => {
              const selected = taskType === t
              const color = TASK_TYPE_COLORS[t]
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.taskTypeChip, selected && { backgroundColor: color, borderColor: color }, !selected && { borderColor: Colors.border }]}
                  onPress={() => setTaskType(t)}
                >
                  <Ionicons name={TASK_TYPE_ICONS[t] as any} size={16} color={selected ? '#fff' : Colors.textSecondary} />
                  <Text style={[styles.taskTypeText, { color: selected ? '#fff' : Colors.textSecondary }]}>{t}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* 誰のもの */}
      {(household?.members ?? []).length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>誰のもの</Text>
          <View style={styles.ownerRow}>
            {(household?.members ?? []).map((o) => {
              const selected = owner === o
              return (
                <TouchableOpacity
                  key={o}
                  style={[styles.ownerChip, selected && styles.ownerChipSelected]}
                  onPress={() => setOwner(selected ? null : o)}
                >
                  <Text style={[styles.ownerText, selected && styles.ownerTextSelected]}>{o}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* 契約開始日（保険・契約のみ） */}
      {hasStartDate(category) && (
        <View style={styles.field}>
          <Text style={styles.label}>{startDateLabel(category)}</Text>
          <TouchableOpacity style={styles.dateTrigger} onPress={() => openDatePicker('start')}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            <Text style={styles.dateText}>{formatDateLabel(startDate)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 期限日 */}
      <View style={styles.field}>
        <Text style={styles.label}>{category === 'タスク' ? '期日' : expirationLabel(category)} <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity style={styles.dateTrigger} onPress={() => openDatePicker('expiration')}>
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          <Text style={styles.dateText}>{formatDateLabel(expirationDate)}</Text>
        </TouchableOpacity>
      </View>

      {/* DateTimePicker */}
      {showDatePicker && (
        <DateTimePicker
          value={currentPickerDate()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          locale="ja-JP"
        />
      )}
      {showDatePicker && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.dateConfirm} onPress={() => setShowDatePicker(false)}>
          <Text style={styles.dateConfirmText}>完了</Text>
        </TouchableOpacity>
      )}

      {/* 金額（タスク以外） */}
      {category !== 'タスク' && (
        <View style={styles.field}>
          <Text style={styles.label}>金額（円）</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="例：50000"
            placeholderTextColor={Colors.placeholder}
            keyboardType="numeric"
          />
        </View>
      )}

      {/* 連絡先（タスク以外） */}
      {category !== 'タスク' && (
        <View style={styles.field}>
          <Text style={styles.label}>連絡先・会社名など</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="例：○○生命保険 0120-xxx-xxx"
            placeholderTextColor={Colors.placeholder}
          />
        </View>
      )}

      {/* メモ */}
      <View style={styles.field}>
        <Text style={styles.label}>メモ</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={memo}
          onChangeText={setMemo}
          placeholder="自由記入"
          placeholderTextColor={Colors.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* 通知タイミング */}
      <View style={styles.field}>
        <Text style={styles.label}>通知タイミング（期限の何日前）</Text>
        <View style={styles.chipRow}>
          {(category === 'タスク'
            ? ['通知なし', '当日', '前日', '3日前', '7日前', '14日前', '30日前']
            : ['通知なし', '7日前', '14日前', '30日前', '60日前', '90日前']
          ).map((label) => {
            const val = label === '通知なし' ? 'none' : label === '当日' ? '0' : label === '前日' ? '1' : label.replace('日前', '')
            const selected = reminderDays === val
            return (
              <TouchableOpacity
                key={label}
                style={[styles.chip, selected && { backgroundColor: val === 'none' ? '#6B7280' : Colors.primary }, !selected && { borderColor: Colors.border, borderWidth: 1.5 }]}
                onPress={() => setReminderDays(val)}
              >
                <Text style={[styles.chipText, { color: selected ? '#fff' : Colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* 画像添付（タスク以外） */}
      {category !== 'タスク' && (
        <View style={styles.field}>
          <Text style={styles.label}>画像添付（証書・書類など）</Text>
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            ) : existingFileId ? (
              <View style={styles.imageExists}>
                <Ionicons name="document-attach" size={32} color={Colors.primary} />
                <Text style={styles.imageExistsText}>添付済み（タップで変更）</Text>
              </View>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.imagePlaceholderText}>タップして画像を選択</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 保存ボタン */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>保存する</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: Spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  required: { color: Colors.danger },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  inputMultiline: { minHeight: 80, paddingTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  taskTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  taskTypeText: { fontSize: 14, fontWeight: '600' },
  ownerRow: { flexDirection: 'row', gap: 10 },
  ownerChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ownerChipSelected: { backgroundColor: tint(Colors.primary, '18'), borderColor: Colors.primary },
  ownerText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  ownerTextSelected: { color: Colors.primary },
  dateTrigger: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateText: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  dateConfirm: { alignItems: 'flex-end', padding: 8 },
  dateConfirmText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  imagePicker: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.card,
  },
  imagePreview: { width: '100%', height: 180 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', height: 120, gap: 8 },
  imagePlaceholderText: { color: Colors.textMuted, fontSize: 14 },
  imageExists: { alignItems: 'center', justifyContent: 'center', height: 80, gap: 6 },
  imageExistsText: { color: Colors.primary, fontSize: 14 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
