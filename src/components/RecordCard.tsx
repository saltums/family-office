import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ExpirationRecord, CATEGORY_COLORS, daysUntilExpiration, formatDate, expirationLabel } from '@/lib/types'
import { tint, Colors } from '@/lib/theme'

interface Props {
  record: ExpirationRecord
  onPress: () => void
  onDelete: () => void
}

const OWNER_COLORS: Record<string, string> = {
  '夫': '#3B82F6',
  '妻': '#EC4899',
  '共有': '#8B5CF6',
}

export function RecordCard({ record, onPress, onDelete }: Props) {
  const days = daysUntilExpiration(record.expiration_date)
  const categoryColor = CATEGORY_COLORS[record.category]

  const urgency = days < 0 ? 'expired' : days <= 7 ? 'urgent' : days <= 30 ? 'warning' : 'normal'

  const daysLabel =
    days < 0
      ? `${Math.abs(days)}日超過`
      : days === 0
      ? '今日が期限'
      : `あと${days}日`

  const daysColor =
    urgency === 'expired' ? '#EF4444' : urgency === 'urgent' ? '#EF4444' : urgency === 'warning' ? '#F59E0B' : '#6B7280'

  function handleDelete() {
    Alert.alert('削除の確認', `「${record.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: onDelete },
    ])
  }

  return (
    <View style={[styles.card, urgency === 'expired' && styles.cardExpired]}>
      <TouchableOpacity style={styles.body} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.top}>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: tint(categoryColor, '22') }]}>
              <Text style={[styles.badgeText, { color: categoryColor }]}>{record.category}</Text>
            </View>
            {record.owner && (
              <View style={[styles.badge, { backgroundColor: tint(OWNER_COLORS[record.owner] ?? '#6B7280', '22') }]}>
                <Text style={[styles.badgeText, { color: OWNER_COLORS[record.owner] ?? '#6B7280' }]}>{record.owner}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.days, { color: daysColor }]}>{daysLabel}</Text>
        </View>

        <Text style={styles.name} numberOfLines={1}>{record.name}</Text>

        {record.start_date && (
          <Text style={styles.date}>開始: {formatDate(record.start_date)}</Text>
        )}
        <Text style={styles.date}>{expirationLabel(record.category)}: {formatDate(record.expiration_date)}</Text>

        {record.amount != null && (
          <Text style={styles.amount}>¥{record.amount.toLocaleString()}</Text>
        )}
        {record.contact ? (
          <Text style={styles.contact} numberOfLines={1}>{record.contact}</Text>
        ) : null}
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPress} hitSlop={8}>
          <Ionicons name="pencil" size={18} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} hitSlop={8}>
          <Ionicons name="remove-circle" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardExpired: { opacity: 0.7 },
  body: { flex: 1, padding: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  days: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  date: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  amount: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  contact: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'column', alignItems: 'center', paddingRight: 8, gap: 8 },
  actionBtn: { padding: 8 },
})
