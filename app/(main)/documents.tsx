import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { DocumentRecord, PcloudFile } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

const ROOT_FOLDER_ID = 29336748129

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function DocumentsScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)
  const [tab, setTab] = useState<'recent' | 'folder'>('recent')

  // 新着データ
  const [allDocs, setAllDocs] = useState<DocumentRecord[]>([])
  const [errorFiles, setErrorFiles] = useState<PcloudFile[]>([])
  const [ocrPause, setOcrPause] = useState<{ until: string; reason: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // フォルダブラウザ
  const [folderStack, setFolderStack] = useState<{ id: number; name: string }[]>([
    { id: ROOT_FOLDER_ID, name: '書類' },
  ])
  const [folderItems, setFolderItems] = useState<PcloudFile[]>([])
  const [folderLoaded, setFolderLoaded] = useState(false)
  const [folderLoading, setFolderLoading] = useState(false)

  useFocusEffect(useCallback(() => {
    if (!household) return
    fetchRecent()
  }, [household]))

  async function fetchRecent() {
    if (!household) return
    setLoading(true)
    const hid = household.id

    const [docsRes, errorsRes, stateRes] = await Promise.all([
      supabase.from('documents').select('*').eq('household_id', hid)
        .order('processed_at', { ascending: false }).limit(50),
      supabase.from('pcloud_files').select('*').eq('household_id', hid).eq('ocr_status', 'error'),
      supabase.from('docs_state').select('value').eq('key', 'ocr_pause').maybeSingle(),
    ])

    setAllDocs((docsRes.data as DocumentRecord[]) ?? [])
    setErrorFiles((errorsRes.data as PcloudFile[]) ?? [])
    if (stateRes.data?.value) setOcrPause(stateRes.data.value as any)
    setLoading(false)
  }

  async function loadFolder(folderId: number) {
    if (!household) return
    setFolderLoading(true)
    const { data } = await supabase
      .from('pcloud_files')
      .select('*')
      .eq('household_id', household.id)
      .eq('parentfolderid', folderId)
      .eq('missing', false)
      .order('is_folder', { ascending: false })
      .order('name')
    setFolderItems((data as PcloudFile[]) ?? [])
    setFolderLoaded(true)
    setFolderLoading(false)
  }

  function handleFolderTab() {
    setTab('folder')
    if (!folderLoaded) loadFolder(ROOT_FOLDER_ID)
  }

  function pushFolder(folderId: number, name: string) {
    const newStack = [...folderStack, { id: folderId, name }]
    setFolderStack(newStack)
    loadFolder(folderId)
  }

  function goToBreadcrumb(index: number) {
    const newStack = folderStack.slice(0, index + 1)
    setFolderStack(newStack)
    loadFolder(newStack[newStack.length - 1].id)
  }

  async function openPdf(file: PcloudFile) {
    try {
      const { data, error } = await supabase.functions.invoke('get-document-link', {
        body: { fileid: file.fileid },
      })
      if (error) {
        const body = await (error as any).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      await Linking.openURL(data.url)
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    }
  }

  async function retryOcr(file: PcloudFile) {
    if (!file.fileid) return
    const { error } = await supabase.rpc('retry_ocr', { p_fileid: file.fileid })
    if (error) {
      Alert.alert('エラー', error.message)
      return
    }
    Alert.alert('やり直しを予約しました', '次の読み取りの回（毎時7分）で、もう一度AIが読みます。')
    fetchRecent()
    if (folderLoaded) loadFolder(folderStack[folderStack.length - 1].id)
  }

  function showFileStatus(file: PcloudFile) {
    let message: string
    if (file.ocr_status === 'pending') {
      const resume = isPaused
        ? `\n無料枠の上限のため、${new Date(ocrPause!.until).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}ごろ再開予定です。`
        : ''
      message = `まだAIが読んでいません。順番に自動で読み取ります。${resume}`
    } else if (file.ocr_status === 'error') {
      message = 'AIの読み取りに失敗しました。毎日17時ごろに自動でやり直します。'
    } else if (file.ocr_status === 'skip') {
      message = '読み取りの対象外のファイルです。'
    } else if (file.ocr_status === 'processing') {
      message = 'いまAIが読み取り中です。'
    } else {
      message = 'まだ登録されていません。'
    }
    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [{ text: '閉じる', style: 'cancel' }]
    if (file.fileid) {
      if (file.ocr_status === 'error') buttons.push({ text: 'もう一度読む', onPress: () => retryOcr(file) })
      buttons.push({ text: '元の書類を開く', onPress: () => openPdf(file) })
    }
    Alert.alert(file.name, message, buttons)
  }

  const pendingDocs = allDocs.filter(d => d.status === 'needs_review')
  const today = new Date().toISOString().slice(0, 10)
  const in30days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const upcomingDocs = allDocs
    .filter(d => {
      const date = d.due_date ?? d.expires_on
      return date && date >= today && date <= in30days
    })
    .sort((a, b) => (a.due_date ?? a.expires_on ?? '').localeCompare(b.due_date ?? b.expires_on ?? ''))
  const recentDocs = allDocs.slice(0, 10)

  const isPaused = ocrPause && new Date(ocrPause.until) > new Date()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>書類</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* タブ */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'recent' && styles.tabActive]}
          onPress={() => setTab('recent')}
        >
          <Text style={[styles.tabText, tab === 'recent' && styles.tabTextActive]}>新着</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'folder' && styles.tabActive]}
          onPress={handleFolderTab}
        >
          <Text style={[styles.tabText, tab === 'folder' && styles.tabTextActive]}>フォルダ</Text>
        </TouchableOpacity>
      </View>

      {/* ===== 新着タブ ===== */}
      {tab === 'recent' ? (
        loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.container}>

            {/* 確認待ちカード */}
            {pendingDocs.length > 0 && (
              <TouchableOpacity
                style={styles.pendingCard}
                onPress={() => router.push(`/document/${pendingDocs[0].id}?mode=review` as any)}
                activeOpacity={0.85}
              >
                <View style={styles.pendingLeft}>
                  <View style={styles.pendingCountRow}>
                    <Text style={styles.pendingCount}>{pendingDocs.length}</Text>
                    <Text style={styles.pendingUnit}>件</Text>
                  </View>
                  <Text style={styles.pendingLabel}>確認待ちの書類</Text>
                </View>
                <View style={styles.reviewBtn}>
                  <Text style={styles.reviewBtnText}>確認をはじめる</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
            )}

            {/* 期限が近い */}
            {upcomingDocs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>期限・予定が近い</Text>
                <View style={styles.listCard}>
                  {upcomingDocs.map((doc, i) => {
                    const dateStr = doc.due_date ?? doc.expires_on ?? ''
                    const days = daysUntil(dateStr)
                    const urgent = days <= 7
                    return (
                      <TouchableOpacity
                        key={doc.id}
                        style={[styles.listRow, i > 0 && styles.rowBorder]}
                        onPress={() => router.push(`/document/${doc.id}` as any)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.daysBadge, { backgroundColor: urgent ? '#FEF2F2' : '#FFFBEB' }]}>
                          <Text style={[styles.daysNum, { color: urgent ? '#EF4444' : '#F59E0B' }]}>
                            {days <= 0 ? '今日' : `${days}日`}
                          </Text>
                        </View>
                        <View style={styles.listBody}>
                          <Text style={styles.listTitle} numberOfLines={1}>{doc.title ?? doc.doc_type ?? '書類'}</Text>
                          <Text style={styles.listSub}>{shortDate(dateStr)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            {/* 最近読み込んだ書類 */}
            {recentDocs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>最近読み込んだ書類</Text>
                <View style={styles.listCard}>
                  {recentDocs.map((doc, i) => (
                    <TouchableOpacity
                      key={doc.id}
                      style={[styles.listRow, i > 0 && styles.rowBorder]}
                      onPress={() => router.push(`/document/${doc.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-text-outline" size={20} color="#0EA5E9" />
                      <View style={styles.listBody}>
                        <Text style={styles.listTitle} numberOfLines={1}>{doc.title ?? doc.doc_type ?? '書類'}</Text>
                        {doc.counterparty
                          ? <Text style={styles.listSub}>{doc.counterparty}</Text>
                          : doc.category
                          ? <Text style={styles.listSub}>{doc.category}</Text>
                          : null}
                      </View>
                      {doc.status === 'needs_review' && (
                        <View style={styles.reviewBadge}>
                          <Text style={styles.reviewBadgeText}>確認待ち</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 読み取り失敗 */}
            {errorFiles.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>読み取り失敗</Text>
                <View style={styles.listCard}>
                  {errorFiles.map((f, i) => (
                    <View key={f.id} style={[styles.listRow, i > 0 && styles.rowBorder]}>
                      <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                      <View style={styles.listBody}>
                        <Text style={styles.listTitle} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.listSub} numberOfLines={1}>毎日17時ごろ自動でやり直します</Text>
                      </View>
                      <TouchableOpacity style={styles.retryBtn} onPress={() => retryOcr(f)} activeOpacity={0.7}>
                        <Ionicons name="refresh" size={14} color="#0EA5E9" />
                        <Text style={styles.retryBtnText}>もう一度読む</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* OCR停止中 */}
            {isPaused && (
              <View style={styles.pauseRow}>
                <Ionicons name="pause-circle-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.pauseText}>
                  {'読み取り一時停止中（無料枠上限）。'}
                  {new Date(ocrPause!.until).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  {'ごろ再開予定'}
                </Text>
              </View>
            )}

            {allDocs.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📄</Text>
                <Text style={styles.emptyTitle}>書類がありません</Text>
                <Text style={styles.emptySub}>pCloudの書類フォルダに追加すると自動で読み込まれます</Text>
              </View>
            )}
          </ScrollView>
        )

      ) : (
        /* ===== フォルダタブ ===== */
        <View style={{ flex: 1 }}>
          {/* パンくず */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.breadcrumbRow}
            contentContainerStyle={styles.breadcrumbContent}
          >
            {folderStack.map((f, i) => (
              <View key={i} style={styles.crumbItem}>
                {i > 0 && <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} style={{ marginHorizontal: 2 }} />}
                <TouchableOpacity
                  onPress={() => i < folderStack.length - 1 && goToBreadcrumb(i)}
                  disabled={i === folderStack.length - 1}
                >
                  <Text style={[styles.crumbText, i === folderStack.length - 1 && styles.crumbCurrent]}>
                    {f.name}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {folderLoading ? (
            <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={styles.container}>
              {folderItems.length === 0 && folderLoaded ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>📂</Text>
                  <Text style={styles.emptyTitle}>このフォルダは空です</Text>
                </View>
              ) : folderItems.length > 0 ? (
                <View style={styles.listCard}>
                  {folderItems.map((item, i) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.listRow, i > 0 && styles.rowBorder]}
                      onPress={() => {
                        if (item.is_folder) {
                          pushFolder(item.folderid!, item.name)
                        } else if (item.document_id) {
                          router.push(`/document/${item.document_id}` as any)
                        } else {
                          showFileStatus(item)
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={item.is_folder ? 'folder' : 'document-text-outline'}
                        size={22}
                        color={item.is_folder ? '#F59E0B' : Colors.textMuted}
                      />
                      <View style={styles.listBody}>
                        <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                      </View>
                      {!item.is_folder && item.ocr_status === 'pending' && (
                        <View style={[styles.fileBadge, { backgroundColor: '#F3F4F6' }]}>
                          <Text style={[styles.fileBadgeText, { color: Colors.textMuted }]}>待ち</Text>
                        </View>
                      )}
                      {!item.is_folder && item.ocr_status === 'error' && (
                        <View style={[styles.fileBadge, { backgroundColor: '#FEF2F2' }]}>
                          <Text style={[styles.fileBadgeText, { color: '#EF4444' }]}>失敗</Text>
                        </View>
                      )}
                      {!item.is_folder && item.ocr_status === 'done' && (
                        <View style={[styles.fileBadge, { backgroundColor: '#F0FDF4' }]}>
                          <Text style={[styles.fileBadgeText, { color: '#10B981' }]}>済</Text>
                        </View>
                      )}
                      {item.is_folder
                        ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                        : item.document_id
                        ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                        : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
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
  navTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  tabRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2, borderBottomColor: '#0EA5E9',
  },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: '#0EA5E9' },
  container: { padding: Spacing.md, gap: 16, paddingBottom: 60 },
  // 確認待ちカード
  pendingCard: {
    backgroundColor: '#0EA5E9', borderRadius: Radius.lg,
    padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pendingLeft: { gap: 2 },
  pendingCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  pendingCount: { fontSize: 32, fontWeight: '900', color: '#fff' },
  pendingUnit: { fontSize: 16, fontWeight: '700', color: '#fff' },
  pendingLabel: { fontSize: 13, color: '#E0F2FE', fontWeight: '600' },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  reviewBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // セクション
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  listBody: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  listSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  // 期限バッジ
  daysBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: 'center' },
  daysNum: { fontSize: 13, fontWeight: '800' },
  // 確認待ちバッジ（リスト内）
  reviewBadge: { backgroundColor: '#FFF7ED', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  reviewBadgeText: { fontSize: 11, fontWeight: '700', color: '#F97316' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#0EA5E9', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  retryBtnText: { fontSize: 12, fontWeight: '700', color: '#0EA5E9' },
  // ファイルバッジ（フォルダビュー）
  fileBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  fileBadgeText: { fontSize: 11, fontWeight: '700' },
  // OCR停止
  pauseRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  pauseText: { fontSize: 12, color: Colors.textMuted, flex: 1, lineHeight: 18 },
  // 空状態
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  // パンくず
  breadcrumbRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  breadcrumbContent: { paddingHorizontal: Spacing.md, paddingVertical: 10, alignItems: 'center', gap: 2 },
  crumbItem: { flexDirection: 'row', alignItems: 'center' },
  crumbText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  crumbCurrent: { color: Colors.text, fontWeight: '700' },
})
