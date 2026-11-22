import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Linking, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import { DocumentRecord, PcloudFile } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
function fmtAmount(n: number | null): string {
  if (n == null) return '—'
  return `¥${n.toLocaleString()}`
}
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

export default function DocumentDetailScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>()
  const reviewMode = mode === 'review'

  const [doc, setDoc] = useState<DocumentRecord | null>(null)
  const [pfile, setPfile] = useState<PcloudFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [openingUrl, setOpeningUrl] = useState(false)
  const [showFullText, setShowFullText] = useState(false)
  const [approveMove, setApproveMove] = useState(true)

  useFocusEffect(useCallback(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('documents').select('*').eq('id', id).single(),
      supabase.from('pcloud_files').select('*').eq('document_id', id).maybeSingle(),
    ]).then(([docRes, fileRes]) => {
      if (docRes.data) {
        const d = docRes.data as DocumentRecord
        setDoc(d)
        setApproveMove(!d.move_approved && !!d.extracted?.suggested_filename)
      }
      if (fileRes.data) setPfile(fileRes.data as PcloudFile)
      setLoading(false)
    })
  }, [id]))

  async function openPdf() {
    if (!pfile?.fileid) {
      Alert.alert('エラー', 'ファイルが見つかりません')
      return
    }
    setOpeningUrl(true)
    try {
      const { data, error } = await supabase.functions.invoke('get-document-link', {
        body: { fileid: pfile.fileid },
      })
      if (error) {
        const body = await (error as any).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      await Linking.openURL(data.url)
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setOpeningUrl(false)
    }
  }

  async function confirm() {
    if (!doc) return
    setConfirming(true)
    const suggested = doc.extracted?.suggested_filename as string | undefined
    const folderPath = doc.pcloud_path
      ? doc.pcloud_path.substring(0, doc.pcloud_path.lastIndexOf('/') + 1)
      : null

    try {
      const { error } = await supabase.from('documents').update({
        status: 'confirmed',
        move_approved: approveMove && !!suggested,
        approved_path: approveMove && suggested && folderPath ? `${folderPath}${suggested}` : null,
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id)
      if (error) throw error

      if (reviewMode) {
        // 次の確認待ちへ
        const auth = getAuthStore()
        const { data: next } = await supabase
          .from('documents')
          .select('id')
          .eq('household_id', auth?.householdId ?? '')
          .eq('status', 'needs_review')
          .neq('id', doc.id)
          .order('processed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (next?.id) {
          router.replace(`/document/${next.id}?mode=review` as any)
        } else {
          Alert.alert('完了', 'すべての書類を確認しました', [
            { text: 'OK', onPress: () => router.back() },
          ])
        }
      } else {
        router.back()
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setConfirming(false)
    }
  }

  function skip() {
    if (!reviewMode) { router.back(); return }
    // 次の確認待ちへ（スキップ）
    const auth = getAuthStore()
    supabase.from('documents').select('id')
      .eq('household_id', auth?.householdId ?? '')
      .eq('status', 'needs_review')
      .neq('id', id)
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: next }) => {
        if (next?.id) {
          router.replace(`/document/${next.id}?mode=review` as any)
        } else {
          router.back()
        }
      })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }
  if (!doc) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={{ color: Colors.textMuted }}>書類が見つかりません</Text></View>
      </SafeAreaView>
    )
  }

  const lowConfidence = doc.confidence != null && doc.confidence < 0.7
  const suggested = doc.extracted?.suggested_filename as string | undefined
  const dueDateStr = doc.due_date ?? doc.expires_on
  const daysLeft = dueDateStr ? daysUntil(dueDateStr) : null

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{doc.title ?? '書類詳細'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>

        {/* 信頼度が低い場合の警告 */}
        {lowConfidence && (
          <View style={styles.warnBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
            <Text style={styles.warnText}>
              読み取り精度が低め({Math.round((doc.confidence ?? 0) * 100)}%)です。内容をよく確認してください。
            </Text>
          </View>
        )}

        {/* ヘッダーカード */}
        <View style={styles.headerCard}>
          {doc.doc_type && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{doc.doc_type}</Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{doc.title ?? '(タイトル不明)'}</Text>
          {doc.counterparty && <Text style={styles.headerSub}>{doc.counterparty}</Text>}
          {dueDateStr && daysLeft != null && (
            <View style={[styles.deadlineBadge, { backgroundColor: daysLeft <= 7 ? Colors.dangerLight : Colors.warningLight }]}>
              <Ionicons name="time-outline" size={13} color={daysLeft <= 7 ? '#EF4444' : '#F59E0B'} />
              <Text style={[styles.deadlineText, { color: daysLeft <= 7 ? '#EF4444' : '#F59E0B' }]}>
                {daysLeft <= 0 ? '期限が来ています' : `${daysLeft}日後 (${fmtDate(dueDateStr)})`}
              </Text>
            </View>
          )}
        </View>

        {/* フィールド一覧 */}
        <View style={styles.card}>
          <FieldRow label="発行元" value={doc.counterparty} />
          <FieldRow label="発行日" value={doc.issued_on ? fmtDate(doc.issued_on) : null} />
          <FieldRow
            label="関係者"
            value={doc.person}
            warn
            warnNote="人名は誤って読み取られやすい項目です"
          />
          <FieldRow label="金額" value={doc.amount ? fmtAmount(doc.amount) : null} />
          {doc.due_date && <FieldRow label="期限日" value={fmtDate(doc.due_date)} />}
          {doc.expires_on && <FieldRow label="有効期限" value={fmtDate(doc.expires_on)} />}
          {doc.category && <FieldRow label="カテゴリ" value={doc.category} />}
        </View>

        {/* 要約 */}
        {doc.summary && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>要約</Text>
            <Text style={styles.summaryText}>{doc.summary}</Text>
          </View>
        )}

        {/* 整理案 */}
        {suggested && doc.status !== 'confirmed' && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>整理案</Text>
            <View style={styles.suggestedRow}>
              <Ionicons name="folder-open-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.suggestedText} numberOfLines={2}>{suggested}</Text>
            </View>
            <View style={styles.approveToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.approveLabel}>確定時にこの整理案も承認する</Text>
                <Text style={styles.approveDesc}>ファイルの移動・名前変更を後で実行します</Text>
              </View>
              <Switch
                value={approveMove}
                onValueChange={setApproveMove}
                trackColor={{ true: '#0EA5E9' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* 元の書類を開く */}
        {pfile && (
          <TouchableOpacity
            style={[styles.openBtn, openingUrl && { opacity: 0.6 }]}
            onPress={openPdf}
            disabled={openingUrl}
          >
            {openingUrl
              ? <ActivityIndicator color={Colors.primary} size="small" />
              : <Ionicons name="open-outline" size={18} color={Colors.primary} />}
            <Text style={styles.openBtnText}>元の書類を開く（ブラウザ）</Text>
          </TouchableOpacity>
        )}

        {/* 全文（折りたたみ） */}
        {doc.full_text && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.fullTextToggle}
              onPress={() => setShowFullText(v => !v)}
            >
              <Text style={styles.cardLabel}>全文</Text>
              <Ionicons
                name={showFullText ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
            {showFullText && (
              <Text style={styles.fullText}>{doc.full_text}</Text>
            )}
          </View>
        )}

        {/* 確認済みの場合 */}
        {doc.status === 'confirmed' && (
          <View style={styles.confirmedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.confirmedText}>確認済み</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 下部アクションボタン */}
      {doc.status === 'needs_review' && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.skipBtn} onPress={skip}>
            <Text style={styles.skipBtnText}>{reviewMode ? 'スキップ' : '戻る'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, confirming && { opacity: 0.6 }]}
            onPress={confirm}
            disabled={confirming}
          >
            {confirming
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.confirmBtnText}>{reviewMode ? '確定して次へ' : '確定'}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

function FieldRow({ label, value, warn, warnNote }: {
  label: string
  value: string | null | undefined
  warn?: boolean
  warnNote?: string
}) {
  if (!value) return null
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.valueWrap}>
        <Text style={[fieldStyles.value, warn && fieldStyles.valueWarn]}>{value}</Text>
        {warn && warnNote && (
          <Text style={fieldStyles.warnNote}>{warnNote}</Text>
        )}
      </View>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, width: 60, paddingTop: 2 },
  valueWrap: { flex: 1, gap: 2 },
  value: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  valueWarn: { color: Colors.warningText },
  warnNote: { fontSize: 11, color: '#F59E0B' },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 40 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warningLight, borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#FDE68A', padding: 12,
  },
  warnText: { fontSize: 13, color: Colors.warningText, flex: 1, lineHeight: 18 },
  headerCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, gap: 6,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '700', color: '#0EA5E9' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 14, color: Colors.textMuted },
  deadlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
    alignSelf: 'flex-start', marginTop: 4,
  },
  deadlineText: { fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  cardLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  summaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  suggestedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 10, marginBottom: 12,
  },
  suggestedText: { fontSize: 13, color: Colors.text, flex: 1 },
  approveToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  approveLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  approveDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: '#0EA5E9',
    padding: 14, justifyContent: 'center',
  },
  openBtnText: { fontSize: 14, fontWeight: '700', color: '#0EA5E9' },
  fullTextToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fullText: { fontSize: 12, color: Colors.textMuted, lineHeight: 20, marginTop: 8 },
  confirmedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.successLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#BBF7D0', padding: 14, justifyContent: 'center',
  },
  confirmedText: { fontSize: 15, fontWeight: '700', color: '#10B981' },
  // 下部ボタン
  actionBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  skipBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  skipBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textMuted },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: Radius.lg,
    backgroundColor: '#0EA5E9', alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
