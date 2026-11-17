import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Switch,
  TextInput,
  Modal,
  Platform,
} from 'react-native'
// Modal kept for version detail sheet
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { Colors, Radius, Spacing } from '@/lib/theme'
import { InviteCode } from '@/lib/types'
import { APP_VERSION, RELEASE_DATE, CHANGELOG, ChangelogEntry } from '@/lib/version'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

const BACKEND_INFO = [
  { label: 'AI整形・タグ抽出', value: 'Gemini 2.0 Flash（Google）', badge: '無料', badgeColor: '#10B981', icon: 'sparkles-outline' },
  { label: '音声認識（STT）', value: 'デバイス内蔵（OS標準）', badge: '無料', badgeColor: '#10B981', icon: 'mic-outline' },
  { label: 'データベース', value: 'Supabase PostgreSQL', badge: null, badgeColor: null, icon: 'server-outline' },
  { label: '認証', value: 'Supabase 匿名認証', badge: null, badgeColor: null, icon: 'shield-checkmark-outline' },
  { label: 'サーバーレス関数', value: 'Supabase Edge Functions', badge: null, badgeColor: null, icon: 'flash-outline' },
]

export default function SettingsScreen() {
  const { userId } = useAuth()
  const { household, refresh: refreshHousehold } = useHousehold(userId)
  const [householdMembers, setHouseholdMembers] = useState<{ user_id: string; joined_at: string }[]>([])
  const [inviteCode, setInviteCode] = useState<InviteCode | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [lineLinked, setLineLinked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [savingMembers, setSavingMembers] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<ChangelogEntry | null>(null)
  const [renamingMember, setRenamingMember] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const [knowledgeCount, setKnowledgeCount] = useState(0)

  useEffect(() => {
    if (!household || !userId) { setLoading(false); return }
    Promise.all([
      supabase.from('household_members').select('*').eq('household_id', household.id),
      Platform.OS === 'web' ? Promise.resolve({ status: 'denied' } as any) : Notifications.getPermissionsAsync(),
      supabase.from('knowledge_items').select('id', { count: 'exact', head: true }).eq('household_id', household.id),
    ]).then(([{ data: membersData }, permData, { count }]) => {
      if (membersData) setHouseholdMembers(membersData)
      setPushEnabled(permData.status === 'granted')
      setLineLinked(!!household.line_group_id)
      if (count !== null) setKnowledgeCount(count)
      setLoading(false)
    })
  }, [household, userId])

  async function addMember() {
    const name = newMemberName.trim()
    if (!name || !household) return
    const current = household.members ?? []
    if (current.includes(name)) {
      Alert.alert('', `「${name}」はすでに追加されています`)
      return
    }
    setSavingMembers(true)
    const { error } = await supabase
      .from('households')
      .update({ members: [...current, name] })
      .eq('id', household.id)
    setSavingMembers(false)
    if (error) { Alert.alert('エラー', '保存できませんでした'); return }
    setNewMemberName('')
    refreshHousehold?.()
  }

  async function removeMember(name: string) {
    if (!household) return
    const current = household.members ?? []
    const updated = current.filter((m) => m !== name)
    const { error } = await supabase
      .from('households')
      .update({ members: updated })
      .eq('id', household.id)
    if (error) { Alert.alert('エラー', '保存できませんでした'); return }
    refreshHousehold?.()
  }

  async function renameMember() {
    const oldName = renamingMember
    const newName = renameText.trim()
    if (!oldName || !newName || !household) return
    if (newName === oldName) { setRenamingMember(null); return }
    const current = household.members ?? []
    if (current.includes(newName)) { Alert.alert('', `「${newName}」はすでに存在します`); return }
    const updated = current.map((m) => (m === oldName ? newName : m))
    const { error } = await supabase
      .from('households')
      .update({ members: updated })
      .eq('id', household.id)
    if (error) { Alert.alert('エラー', '保存できませんでした'); return }
    setRenamingMember(null)
    refreshHousehold?.()
  }

  async function generateInviteCode() {
    if (!household || !userId) return
    setGeneratingCode(true)
    const code = generateCode()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    const { data, error } = await supabase
      .from('invite_codes')
      .insert({ household_id: household.id, code, created_by: userId, expires_at: expiresAt.toISOString() })
      .select()
      .single()
    setGeneratingCode(false)
    if (error) { Alert.alert('エラー', '招待コードの生成に失敗しました'); return }
    setInviteCode(data as InviteCode)
  }

  const WEB_APP_URL = 'https://creative-speculoos-29a600.netlify.app'

  async function copyInviteCode() {
    if (!inviteCode) return
    await Share.share({ message: inviteCode.code })
  }

  async function shareInviteCode() {
    if (!inviteCode) return
    const baseLink = `${WEB_APP_URL}/?code=${inviteCode.code}`
    // iOSのLINEはopenExternalBrowser=1でSafariで開く。Androidには不要
    const shareUrl = Platform.OS === 'ios' ? `${baseLink}&openExternalBrowser=1` : baseLink
    const text = `買い物リストをシェアするよ📋\n\nこのリンクをタップして参加してね👇\n${Platform.OS === 'android' ? baseLink + '\n' : ''}\n招待コード: ${inviteCode.code}\n（有効期限：7日間）`
    await Share.share({ message: text, url: shareUrl })
  }

  async function requestPushPermission() {
    const { status } = await Notifications.requestPermissionsAsync()
    setPushEnabled(status === 'granted')
    if (status !== 'granted') Alert.alert('通知が無効', '設定アプリから通知を許可してください')
  }

  async function handleSignOut() {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  const members = household?.members ?? []
  const latestEntry = CHANGELOG[0]
  const olderEntries = CHANGELOG.slice(1)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>設定</Text>

        {/* 世帯情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>世帯</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="home-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>{household?.name}</Text>
              <Text style={styles.rowSub}>{householdMembers.length}人</Text>
            </View>
          </View>
        </View>

        {/* メンバー管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>家族メンバー（誰のもの）</Text>
          <View style={styles.card}>
            {members.map((m) => (
              <View key={m} style={styles.memberRow}>
                <Ionicons name="person-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.memberName}>{m}</Text>
                <TouchableOpacity
                  onPress={() => { setRenamingMember(m); setRenameText(m) }}
                  hitSlop={8}
                  style={{ marginRight: 4 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeMember(m)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addMemberRow}>
              <TextInput
                style={styles.memberInput}
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder="例：子供1、じいじ"
                placeholderTextColor={Colors.placeholder}
                returnKeyType="done"
                onSubmitEditing={addMember}
              />
              <TouchableOpacity
                style={[styles.addBtn, savingMembers && { opacity: 0.5 }]}
                onPress={addMember}
                disabled={savingMembers}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 招待コード */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>パートナーを招待</Text>
          <View style={styles.card}>
            {inviteCode ? (
              <>
                <TouchableOpacity onPress={copyInviteCode} activeOpacity={0.7} style={styles.inviteCodeWrap}>
                  <Text style={styles.inviteCode}>{inviteCode.code}</Text>
                  <View style={styles.copyHint}>
                    <Ionicons name="copy-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.copyHintText}>タップでコピー</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.inviteExpiry}>7日間有効</Text>
                <TouchableOpacity style={styles.btn} onPress={shareInviteCode}>
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.btnText}>招待コードを共有</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.btn, generatingCode && styles.btnDisabled]}
                onPress={generateInviteCode}
                disabled={generatingCode}
              >
                {generatingCode ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                    <Text style={styles.btnText}>招待コードを発行</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 通知 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通知</Text>
          <View style={styles.card}>
            {Platform.OS !== 'web' && (
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
                <View>
                  <Text style={styles.switchLabel}>プッシュ通知</Text>
                  <Text style={styles.switchDesc}>期限前にアプリで通知</Text>
                </View>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={pushEnabled ? undefined : requestPushPermission}
                trackColor={{ true: Colors.primary }}
                thumbColor="#fff"
              />
            </View>
            )}
            <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
              <View style={styles.switchLeft}>
                <Ionicons name="chatbubble-outline" size={20} color={Colors.textSecondary} />
                <View>
                  <Text style={styles.switchLabel}>LINE通知</Text>
                  <Text style={styles.switchDesc}>{lineLinked ? 'グループと連携済み' : '未設定'}</Text>
                </View>
              </View>
              <Ionicons name={lineLinked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={lineLinked ? Colors.success : Colors.textMuted} />
            </View>
          </View>
        </View>

        {/* 知識ベース */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.navRow} onPress={() => router.push('/knowledge' as any)}>
              <View style={styles.navRowIcon}>
                <Ionicons name="library-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowLabel}>知識ベース</Text>
                <Text style={styles.navRowSub}>日記から自動蓄積 · {knowledgeCount}件</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* バックエンド情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>バックエンド構成</Text>
          <View style={styles.card}>
            {BACKEND_INFO.map((item, i) => (
              <View key={item.label} style={[styles.backendRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <View style={styles.backendIconWrap}>
                  <Ionicons name={item.icon as any} size={16} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.backendLabel}>{item.label}</Text>
                  <Text style={styles.backendValue}>{item.value}</Text>
                </View>
                {item.badge && (
                  <View style={[styles.freeBadge, { backgroundColor: item.badgeColor + '22' }]}>
                    <Text style={[styles.freeBadgeText, { color: item.badgeColor! }]}>{item.badge}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* ログアウト */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.signOutText}>ログアウト</Text>
        </TouchableOpacity>

        {/* バージョン情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>バージョン履歴</Text>
          <View style={styles.card}>
            {/* 最新バージョン: インライン表示 */}
            <View style={styles.versionBlock}>
              <View style={styles.versionHeader}>
                <View style={[styles.versionBadge, styles.versionBadgeCurrent]}>
                  <Text style={[styles.versionBadgeText, styles.versionBadgeTextCurrent]}>
                    v{latestEntry.version}
                  </Text>
                </View>
                <View style={styles.currentTag}>
                  <Text style={styles.currentTagText}>現在</Text>
                </View>
                <Text style={styles.versionDate}>{latestEntry.date}{latestEntry.time ? ` ${latestEntry.time}` : ''}</Text>
              </View>
              {latestEntry.changes.map((c, j) => (
                <View key={j} style={styles.changeRow}>
                  <Text style={styles.changeDot}>·</Text>
                  <Text style={styles.changeText}>{c}</Text>
                </View>
              ))}
            </View>

            {/* 過去バージョン: タップでモーダル */}
            {olderEntries.map((entry) => (
              <TouchableOpacity
                key={entry.version}
                style={styles.oldVersionRow}
                onPress={() => setSelectedVersion(entry)}
                activeOpacity={0.7}
              >
                <View style={styles.versionBadge}>
                  <Text style={styles.versionBadgeText}>v{entry.version}</Text>
                </View>
                <Text style={styles.oldVersionDate}>{entry.date}{entry.time ? ` ${entry.time}` : ''}</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* メンバー名変更モーダル */}
      <Modal
        visible={!!renamingMember}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingMember(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { borderRadius: 16, paddingTop: 20 }]}>
            <Text style={styles.renameTitle}>名前を変更</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={renameMember}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setRenamingMember(null)}>
                <Text style={styles.renameCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameOkBtn} onPress={renameMember}>
                <Text style={styles.renameOkText}>変更</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 過去バージョン詳細モーダル */}
      <Modal
        visible={!!selectedVersion}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedVersion(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText}>v{selectedVersion?.version}</Text>
              </View>
              <Text style={styles.modalDate}>
                {selectedVersion?.date}{selectedVersion?.time ? ` ${selectedVersion.time}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setSelectedVersion(null)} hitSlop={12} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {selectedVersion?.changes.map((c, i) => (
                <View key={i} style={styles.changeRow}>
                  <Text style={styles.changeDot}>·</Text>
                  <Text style={[styles.changeText, { fontSize: 14 }]}>{c}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.md, paddingBottom: 60 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  navRowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  navRowLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  navRowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { flex: 1, fontSize: 16, color: Colors.text, fontWeight: '600' },
  rowSub: { fontSize: 14, color: Colors.textMuted },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  memberName: { flex: 1, fontSize: 15, color: Colors.text },
  addMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  memberInput: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: Colors.text },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 10 },
  inviteCodeWrap: { alignItems: 'center', paddingVertical: 4 },
  inviteCode: { fontSize: 28, fontWeight: '800', color: Colors.primary, textAlign: 'center', letterSpacing: 4 },
  copyHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 2 },
  copyHintText: { fontSize: 11, color: Colors.textMuted },
  inviteExpiry: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: 14 },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  switchLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  switchLabel: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  switchDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 8 },
  signOutText: { color: Colors.danger, fontSize: 15, fontWeight: '600' },
  // バックエンド情報
  backendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  backendIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  backendLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  backendValue: { fontSize: 13, color: Colors.text, fontWeight: '500', marginTop: 1 },
  freeBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  freeBadgeText: { fontSize: 11, fontWeight: '700' },
  // バージョン履歴
  versionBlock: { paddingVertical: 12 },
  versionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  versionBadge: { backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  versionBadgeCurrent: { backgroundColor: Colors.primary },
  versionBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  versionBadgeTextCurrent: { color: '#fff' },
  currentTag: { backgroundColor: '#10B981' + '20', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  currentTagText: { fontSize: 11, fontWeight: '700', color: '#10B981' },
  versionDate: { fontSize: 12, color: Colors.textMuted, marginLeft: 'auto' },
  changeRow: { flexDirection: 'row', gap: 6, marginBottom: 3 },
  changeDot: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  changeText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  oldVersionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  oldVersionDate: { fontSize: 12, color: Colors.textMuted },
  // モーダル
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.md, paddingBottom: 40, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalDate: { fontSize: 13, color: Colors.textMuted },
  modalBody: { paddingTop: 12 },
  renameTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  renameInput: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 16, color: Colors.text, marginHorizontal: Spacing.md,
  },
  renameActions: { flexDirection: 'row', gap: 10, padding: Spacing.md, paddingTop: 16 },
  renameCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  renameCancelText: { fontSize: 15, color: Colors.textMuted, fontWeight: '600' },
  renameOkBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  renameOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },
})
