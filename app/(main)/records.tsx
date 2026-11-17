import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { RecordCard } from '@/components/RecordCard'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ExpirationRecord, Card, PasswordEntry, Category, daysUntilExpiration } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

type Tab = 'すべて' | Category
type Section = '期限' | '銀行' | 'カード' | 'パスワード' | '家族' | '金銭'

function parseMemo(memo: string | null): Record<string, string> {
  try { if (memo && memo.startsWith('{')) return JSON.parse(memo) } catch {}
  return { note: memo ?? '' }
}
const parseCardMemo = parseMemo

function isCardExpired(expiry: string): boolean {
  const parts = expiry.split('/')
  if (parts.length !== 2) return false
  const month = parseInt(parts[0])
  const year = 2000 + parseInt(parts[1])
  if (isNaN(month) || isNaN(year)) return false
  const now = new Date()
  return new Date(year, month, 0) < now
}

interface FamilyMember {
  id: string
  name: string
  relationship: string | null
  birthday: string | null
}

export default function RecordsScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)
  const [section, setSection] = useState<Section>('期限')
  const [records, setRecords] = useState<ExpirationRecord[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [banks, setBanks] = useState<PasswordEntry[]>([])
  const [pwEntries, setPwEntries] = useState<PasswordEntry[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState<Tab>('すべて')
  const [hideExpired, setHideExpired] = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('')

  const fetchRecords = useCallback(async () => {
    if (!household) { setLoading(false); return }
    const [recordsRes, cardsRes, pwRes, membersRes] = await Promise.all([
      supabase
        .from('records')
        .select('*')
        .eq('household_id', household.id)
        .neq('category', 'タスク')
        .order('expiration_date', { ascending: true }),
      supabase
        .from('cards')
        .select('*')
        .eq('household_id', household.id)
        .order('name', { ascending: true }),
      supabase
        .from('passwords')
        .select('*')
        .eq('household_id', household.id)
        .order('site_name', { ascending: true }),
      supabase
        .from('family_members')
        .select('id, name, relationship, birthday')
        .eq('household_id', household.id)
        .order('name', { ascending: true }),
    ])
    if (!recordsRes.error && recordsRes.data) setRecords(recordsRes.data as ExpirationRecord[])
    if (!cardsRes.error && cardsRes.data) setCards(cardsRes.data as Card[])
    if (!pwRes.error && pwRes.data) {
      const all = pwRes.data as PasswordEntry[]
      setBanks(all.filter((p: any) => p.url === 'bank://'))
      setPwEntries(all.filter((p: any) => p.url !== 'bank://'))
    }
    if (!membersRes.error && membersRes.data) setFamilyMembers(membersRes.data as FamilyMember[])
    setLoading(false)
    setRefreshing(false)
  }, [household])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  useEffect(() => {
    if (!household) return
    const channel = supabase
      .channel(`records:${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `household_id=eq.${household.id}` }, () => fetchRecords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `household_id=eq.${household.id}` }, () => fetchRecords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passwords', filter: `household_id=eq.${household.id}` }, () => fetchRecords())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [household, fetchRecords])

  async function deleteRecord(id: string) {
    const { error } = await supabase.from('records').delete().eq('id', id)
    if (error) Alert.alert('エラー', '削除できませんでした')
    else setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  const filtered = selectedTab === 'すべて' ? records : records.filter((r) => r.category === selectedTab)
  const urgentCount = records.filter((r) => daysUntilExpiration(r.expiration_date) <= 30 && daysUntilExpiration(r.expiration_date) >= 0).length

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.householdName}>{household?.name ?? ''}</Text>
          <Text style={styles.pageTitle}>管理</Text>
        </View>
        <Link href="/(main)/settings" asChild>
          <TouchableOpacity hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </Link>
      </View>

      {/* セクション切り替え */}
      <View style={styles.sectionSwitcher}>
        {([
          { key: '期限', icon: 'calendar-outline', label: '期限', count: urgentCount > 0 ? urgentCount : 0, countColor: Colors.warning },
          { key: '銀行', icon: 'business-outline', label: '銀行', count: banks.length, countColor: '#10B981' },
          { key: 'カード', icon: 'card-outline', label: 'カード', count: cards.length, countColor: Colors.primary },
          { key: 'パスワード', icon: 'lock-closed-outline', label: 'PW', count: pwEntries.length, countColor: '#6B7280' },
          { key: '家族', icon: 'people-outline', label: '家族', count: familyMembers.length, countColor: '#8B5CF6' },
          { key: '金銭', icon: 'cash-outline', label: '金銭', count: 0, countColor: '#10B981' },
        ] as const).map(({ key, icon, label, count, countColor }) => (
          <TouchableOpacity
            key={key}
            style={[styles.sectionBtn, section === key && styles.sectionBtnActive]}
            onPress={() => {
              if (key === '金銭') { router.push('/money' as any); return }
              setSection(key as Section)
            }}
          >
            <Ionicons name={icon as any} size={15} color={section === key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.sectionBtnText, section === key && styles.sectionBtnTextActive]}>{label}</Text>
            {count > 0 && (
              <View style={[styles.badge, { backgroundColor: countColor }]}>
                <Text style={styles.badgeText}>{count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {section === '期限' ? (
        <>
          {urgentCount > 0 && (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
              <Text style={styles.bannerText}>
                30日以内に期限を迎える項目が <Text style={styles.bannerCount}>{urgentCount}件</Text> あります
              </Text>
            </View>
          )}
          <CategoryTabs selected={selectedTab} onSelect={setSelectedTab} />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <RecordCard
                record={item}
                onPress={() => router.push(`/record/${item.id}`)}
                onDelete={() => deleteRecord(item.id)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecords() }} tintColor={Colors.primary} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>まだ登録がありません</Text>
                <Text style={styles.emptyText}>右下の＋ボタンから追加しましょう</Text>
              </View>
            }
            contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
          />
          <TouchableOpacity style={styles.fab} onPress={() => router.push('/record/new')}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      ) : section === '銀行' ? (() => {
        const members = household?.members ?? []
        const visibleBanks = ownerFilter
          ? banks.filter(b => parseMemo(b.memo).owner === ownerFilter)
          : banks
        return (
          <>
            {members.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                {['全員', ...members].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.filterChip, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipActive]}
                    onPress={() => setOwnerFilter(m === '全員' ? '' : m)}
                  >
                    <Text style={[styles.filterChipText, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <FlatList
              data={visibleBanks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const ex = parseMemo(item.memo)
                return (
                  <TouchableOpacity style={styles.cardItem} onPress={() => router.push(`/password/${item.id}` as any)} activeOpacity={0.7}>
                    <View style={[styles.cardIcon, { backgroundColor: '#10B98118' }]}>
                      <Ionicons name="business-outline" size={20} color="#10B981" />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardNameRow}>
                        <Text style={styles.cardName}>{item.site_name}</Text>
                        {ex.owner ? <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>{ex.owner}</Text></View> : null}
                      </View>
                      {item.username ? <Text style={styles.cardNumberMasked}>{item.username}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )
              }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecords() }} tintColor={Colors.primary} />
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>{ownerFilter ? `${ownerFilter}の口座がありません` : '銀行口座がありません'}</Text>
                  <Text style={styles.emptyText}>管理画面から追加できます</Text>
                </View>
              }
              contentContainerStyle={[styles.list, visibleBanks.length === 0 && styles.listEmpty]}
            />
          </>
        )
      })() : section === 'カード' ? (() => {
        const members = household?.members ?? []
        const ownerFiltered = ownerFilter
          ? cards.filter(c => parseCardMemo(c.memo).owner === ownerFilter)
          : cards
        const visibleCards = hideExpired
          ? ownerFiltered.filter(c => {
              const ex = parseCardMemo(c.memo)
              return !ex.expiry || !isCardExpired(ex.expiry)
            })
          : ownerFiltered
        const expiredCount = ownerFiltered.length - ownerFiltered.filter(c => {
          const ex = parseCardMemo(c.memo)
          return !ex.expiry || !isCardExpired(ex.expiry)
        }).length
        return (
          <>
            {members.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                {['全員', ...members].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.filterChip, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipActive]}
                    onPress={() => setOwnerFilter(m === '全員' ? '' : m)}
                  >
                    <Text style={[styles.filterChipText, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {expiredCount > 0 && (
              <TouchableOpacity
                style={styles.expiredToggle}
                onPress={() => setHideExpired(v => !v)}
              >
                <Ionicons
                  name={hideExpired ? 'eye-off-outline' : 'eye-outline'}
                  size={15}
                  color={Colors.textMuted}
                />
                <Text style={styles.expiredToggleText}>
                  {hideExpired
                    ? `期限切れ ${expiredCount}枚を非表示中`
                    : `期限切れを含む全${cards.length}枚を表示中`}
                </Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={visibleCards}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const ex = parseCardMemo(item.memo)
                const expired = ex.expiry ? isCardExpired(ex.expiry) : false
                return (
                  <TouchableOpacity
                    style={[styles.cardItem, expired && styles.cardItemExpired]}
                    onPress={() => router.push(`/card/${item.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.cardIcon, expired && { backgroundColor: '#9CA3AF18' }]}>
                      <Ionicons name="card-outline" size={20} color={expired ? Colors.textMuted : Colors.primary} />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardNameRow}>
                        <Text style={[styles.cardName, expired && { color: Colors.textMuted }]}>{item.name}</Text>
                        {ex.owner ? (
                          <View style={styles.ownerBadge}>
                            <Text style={styles.ownerBadgeText}>{ex.owner}</Text>
                          </View>
                        ) : null}
                        {expired ? (
                          <View style={styles.expiredBadge}>
                            <Text style={styles.expiredBadgeText}>期限切れ</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.cardNumberMasked}>
                        {item.card_number.length <= 4
                          ? item.card_number
                          : item.card_number.slice(0, -4).replace(/[0-9a-zA-Z]/g, '•') + item.card_number.slice(-4)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )
              }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecords() }} tintColor={Colors.primary} />
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="card-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>
                    {hideExpired && expiredCount > 0 ? '有効なカードがありません' : 'カードがありません'}
                  </Text>
                  <Text style={styles.emptyText}>右下の＋ボタンから追加しましょう</Text>
                </View>
              }
              contentContainerStyle={[styles.list, visibleCards.length === 0 && styles.listEmpty]}
            />
            <TouchableOpacity style={styles.fab} onPress={() => router.push('/card/new' as any)}>
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          </>
        )
      })() : section === 'パスワード' ? (() => {
        const members = household?.members ?? []
        const visiblePw = ownerFilter
          ? pwEntries.filter(p => parseMemo(p.memo).owner === ownerFilter)
          : pwEntries
        return (
          <>
            {members.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                {['全員', ...members].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.filterChip, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipActive]}
                    onPress={() => setOwnerFilter(m === '全員' ? '' : m)}
                  >
                    <Text style={[styles.filterChipText, (m === '全員' ? ownerFilter === '' : ownerFilter === m) && styles.filterChipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <FlatList
              data={visiblePw}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const ex = parseMemo(item.memo)
                return (
                  <TouchableOpacity style={styles.cardItem} onPress={() => router.push(`/password/${item.id}` as any)} activeOpacity={0.7}>
                    <View style={[styles.cardIcon, { backgroundColor: '#10B98118' }]}>
                      <Ionicons name="lock-closed-outline" size={20} color="#10B981" />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardNameRow}>
                        <Text style={styles.cardName}>{item.site_name}</Text>
                        {ex.owner ? <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>{ex.owner}</Text></View> : null}
                      </View>
                      {item.username
                        ? <Text style={styles.cardNumberMasked}>{item.username}</Text>
                        : <Text style={styles.cardNumberMasked}>{'•'.repeat(8)}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )
              }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecords() }} tintColor={Colors.primary} />
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>{ownerFilter ? `${ownerFilter}のPWがありません` : 'パスワードがありません'}</Text>
                  <Text style={styles.emptyText}>右下の＋ボタンから追加しましょう</Text>
                </View>
              }
              contentContainerStyle={[styles.list, visiblePw.length === 0 && styles.listEmpty]}
            />
            <TouchableOpacity style={[styles.fab, { backgroundColor: '#10B981' }]} onPress={() => router.push('/password/new' as any)}>
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          </>
        )
      })() : (
        <FlatList
          data={familyMembers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.cardItem} onPress={() => router.push(`/family/${item.id}` as any)} activeOpacity={0.7}>
              <View style={[styles.cardIcon, { backgroundColor: '#8B5CF618' }]}>
                <Ionicons name="person-outline" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}{item.relationship ? `（${item.relationship}）` : ''}</Text>
                {item.birthday
                  ? <Text style={styles.cardNumberMasked}>誕生日: {item.birthday}</Text>
                  : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecords() }} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>家族が登録されていません</Text>
              <Text style={styles.emptyText}>カレンダー画面から追加できます</Text>
            </View>
          }
          contentContainerStyle={[styles.list, familyMembers.length === 0 && styles.listEmpty]}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  householdName: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  sectionSwitcher: {
    flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 4, gap: 4,
  },
  sectionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: Radius.md,
  },
  sectionBtnActive: { backgroundColor: Colors.primary + '18' },
  sectionBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  sectionBtnTextActive: { color: Colors.primary },
  badge: {
    backgroundColor: Colors.warning, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warningLight,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  bannerText: { fontSize: 13, color: '#92400E', flex: 1 },
  bannerCount: { fontWeight: '700' },
  list: { paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  cardItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    marginHorizontal: Spacing.md, marginBottom: 8,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardNumberMasked: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'monospace', marginTop: 2 },
  cardMemo: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ownerBadge: {
    backgroundColor: Colors.primary + '20', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  ownerBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  expiredBadge: {
    backgroundColor: '#9CA3AF20', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  expiredBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  cardItemExpired: { opacity: 0.6 },
  expiredToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: Spacing.md, marginBottom: 8,
  },
  expiredToggleText: { fontSize: 13, color: Colors.textMuted },
  filterRow: { flexGrow: 0, marginBottom: 8 },
  filterRowContent: { paddingHorizontal: Spacing.md, gap: 8, paddingVertical: 4 },
  filterChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  fab: {
    position: 'absolute', right: 24, bottom: 32,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
})
