import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Alert,
  ScrollView,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '@/lib/supabase'
import { appendImageFile } from '@/lib/formFile'
import { useAuthStore } from '@/hooks/useAuthStore'
import { DiaryEntry, PhotoEntry } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'


const DAYS = ['日', '月', '火', '水', '木', '金', '土']

function groupByDate(entries: DiaryEntry[]): { title: string; data: DiaryEntry[] }[] {
  const map = new Map<string, DiaryEntry[]>()
  for (const e of entries) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, data]) => ({ title: date, data }))
}

function PhotoStrip({
  photos,
  uploading,
  onAdd,
}: {
  photos: PhotoEntry[]
  uploading: boolean
  onAdd: () => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.photoStrip}
      contentContainerStyle={styles.photoStripContent}
    >
      {photos.map((p) =>
        p.url ? (
          <Image key={p.id} source={{ uri: p.url }} style={styles.thumbnail} />
        ) : (
          <View key={p.id} style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
          </View>
        )
      )}
      {uploading ? (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <TouchableOpacity style={[styles.thumbnail, styles.addPhotoBtn]} onPress={onAdd} activeOpacity={0.6}>
          <Ionicons name="camera-outline" size={16} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

export default function DiaryScreen() {
  const auth = useAuthStore()
  const userId = auth?.userId ?? null
  const householdId = auth?.householdId ?? null
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [photosByDate, setPhotosByDate] = useState<Map<string, PhotoEntry[]>>(new Map())
  const [uploadingDate, setUploadingDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const fetchEntries = useCallback(async () => {
    if (!householdId) { setLoading(false); setRefreshing(false); return }
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

      const [diaryRes, photosRes] = await Promise.all([
        supabase
          .from('diary_entries')
          .select('*')
          .eq('household_id', householdId)
          .gte('date', from)
          .lte('date', to)
          .order('created_at', { ascending: false }),
        supabase
          .from('photo_entries')
          .select('*')
          .eq('household_id', householdId)
          .gte('entry_date', from)
          .lte('entry_date', to)
          .order('created_at', { ascending: true }),
      ])

      if (!diaryRes.error && diaryRes.data) setEntries(diaryRes.data as DiaryEntry[])

      if (!photosRes.error && photosRes.data && photosRes.data.length > 0) {
        const photos = photosRes.data as PhotoEntry[]
        const fileids = photos.map((p) => p.pcloud_file_id)
        const { data: urlData, error: urlErr } = await supabase.functions.invoke('get-photo-urls', {
          body: { fileids },
        })
        if (urlErr) console.warn('get-photo-urls error:', urlErr)
        const urlMap = new Map<number, string>()
        for (const u of (urlData.urls ?? [])) {
          if (u.url) urlMap.set(u.fileid, u.url)
        }
        const withUrls = photos.map((p) => ({ ...p, url: urlMap.get(p.pcloud_file_id) }))
        const grouped = new Map<string, PhotoEntry[]>()
        for (const p of withUrls) {
          const list = grouped.get(p.entry_date) ?? []
          list.push(p)
          grouped.set(p.entry_date, list)
        }
        setPhotosByDate(grouped)
      } else {
        setPhotosByDate(new Map())
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [householdId, year, month])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function handleAddPhoto(date: string) {
    try {
      if (!userId || !householdId) {
        Alert.alert('認証エラー', 'ユーザー情報が取得できていません')
        return
      }
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (permResult.status !== 'granted') {
        Alert.alert('権限が必要です', `写真ライブラリへのアクセスを許可してください\n(status: ${permResult.status})`)
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      })
      if (result.canceled || !result.assets?.[0]) return

      setUploadingDate(date)
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1500 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        )
        const filename = `photo_${Date.now()}.jpg`
        const form = new FormData()
        await appendImageFile(form, 'file', compressed.uri, filename)
        form.append('household_id', householdId)
        form.append('date', date)

        const { data: uploadData, error: uploadErr } = await supabase.functions.invoke('upload-photo', { body: form })
        if (uploadErr) {
          let msg = uploadErr.message
          try {
            const body = await (uploadErr as any).context?.json?.()
            if (body?.error) msg = body.error
          } catch {}
          throw new Error(msg || 'upload-photo failed')
        }
        if (uploadData?.error) throw new Error(uploadData.error)

        const { data: inserted, error: insertErr } = await supabase
          .from('photo_entries')
          .insert({
            household_id: householdId,
            entry_date: date,
            pcloud_file_id: uploadData.fileid,
            pcloud_path: uploadData.path,
            created_by: userId,
          })
          .select().single()
        if (insertErr) throw new Error(insertErr.message)

        const { data: urlData } = await supabase.functions.invoke('get-photo-urls', {
          body: { fileids: [uploadData.fileid] },
        })
        const url = urlData?.urls?.[0]?.url ?? undefined

        setPhotosByDate((prev) => {
          const next = new Map(prev)
          const list = [...(next.get(date) ?? [])]
          list.push({ ...(inserted as PhotoEntry), url })
          next.set(date, list)
          return next
        })
      } finally {
        setUploadingDate(null)
      }
    } catch (e: any) {
      console.error('photo upload error:', e)
      Alert.alert('エラー', e.message ?? String(e))
    }
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const sections = groupByDate(entries)
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map())

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const showTodayPhotos = isCurrentMonth && !sections.find((s) => s.title === todayStr)

  function confirmDelete(item: DiaryEntry) {
    Alert.alert(
      '削除',
      `「${item.content.slice(0, 30)}${item.content.length > 30 ? '…' : ''}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel', onPress: () => swipeableRefs.current.get(item.id)?.close() },
        {
          text: '削除', style: 'destructive',
          onPress: async () => {
            await supabase.from('diary_entries').delete().eq('id', item.id)
            setEntries((prev) => prev.filter((e) => e.id !== item.id))
          },
        },
      ]
    )
  }

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
        <Text style={styles.pageTitle}>日記</Text>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthBtn} onPress={prevMonth} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{year}年{month}月</Text>
          <TouchableOpacity
            style={[styles.monthBtn, isCurrentMonth && styles.monthBtnDisabled]}
            onPress={nextMonth} disabled={isCurrentMonth} hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? Colors.border : Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => {
          const d = new Date(section.title)
          const dayNum = String(d.getDate()).padStart(2, '0')
          const dow = DAYS[d.getDay()]
          return (
            <View style={styles.dateSectionWrap}>
              <View style={styles.dateZone}>
                <Text style={styles.dateBigNum}>{dayNum}</Text>
                <Text style={styles.dateDow}>{dow}</Text>
                <View style={styles.dateRule} />
              </View>
              <PhotoStrip
                photos={photosByDate.get(section.title) ?? []}
                uploading={uploadingDate === section.title}
                onAdd={() => handleAddPhoto(section.title)}
              />
            </View>
          )
        }}
        renderItem={({ item, index, section }) => {
          const t = new Date(item.created_at)
          const h = String(t.getHours()).padStart(2, '0')
          const m = String(t.getMinutes()).padStart(2, '0')
          const isLast = index === section.data.length - 1
          return (
            <Swipeable
              ref={(ref) => {
                if (ref) swipeableRefs.current.set(item.id, ref)
                else swipeableRefs.current.delete(item.id)
              }}
              renderRightActions={() => (
                <TouchableOpacity style={styles.deleteAction} onPress={() => confirmDelete(item)} activeOpacity={0.85}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              rightThreshold={60}
              overshootRight={false}
            >
              <TouchableOpacity
                style={[styles.entryRow, isLast && styles.entryRowLast]}
                onPress={() => router.push(`/diary/${item.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.timeHour}>{h}</Text>
                  <Text style={styles.timeMin}>{m}</Text>
                </View>
                <View style={styles.entryContent}>
                  <Text style={styles.contentText} numberOfLines={4}>{item.content}</Text>
                  {item.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {item.tags.map((tag) => (
                        <Text key={tag} style={styles.tagText}>#{tag}</Text>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Swipeable>
          )
        }}
        ListHeaderComponent={
          showTodayPhotos ? (
            <View style={styles.dateSectionWrap}>
              <View style={styles.dateZone}>
                <Text style={styles.dateBigNum}>{String(now.getDate()).padStart(2, '0')}</Text>
                <Text style={styles.dateDow}>{DAYS[now.getDay()]}</Text>
                <View style={styles.dateRule} />
              </View>
              <PhotoStrip
                photos={photosByDate.get(todayStr) ?? []}
                uploading={uploadingDate === todayStr}
                onAdd={() => handleAddPhoto(todayStr)}
              />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEntries() }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          showTodayPhotos ? null : (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={44} color={Colors.border} />
              <Text style={styles.emptyTitle}>{year}年{month}月の日記はありません</Text>
            </View>
          )
        }
        contentContainerStyle={[styles.list, entries.length === 0 && styles.listEmpty]}
        stickySectionHeadersEnabled={false}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({
          pathname: '/diary/new' as any,
          params: { uid: auth?.userId ?? '', hid: auth?.householdId ?? '' },
        })}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  monthBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  monthBtnDisabled: { opacity: 0.3 },
  monthLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, minWidth: 72, textAlign: 'center' },

  dateSectionWrap: {
    paddingTop: 20,
    backgroundColor: Colors.bg,
  },
  dateZone: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: 10,
    gap: 10,
  },
  dateBigNum: { fontSize: 28, fontWeight: '500', color: Colors.text, lineHeight: 32 },
  dateDow: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  dateRule: { flex: 1, height: 0.5, backgroundColor: Colors.border },

  photoStrip: { backgroundColor: Colors.bg },
  photoStripContent: { paddingHorizontal: Spacing.md, paddingBottom: 8, gap: 6 },
  thumbnail: { width: 44, height: 44, borderRadius: Radius.sm, overflow: 'hidden' },
  thumbnailPlaceholder: { backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  addPhotoBtn: {
    backgroundColor: Colors.primary + '22',
    borderWidth: 1,
    borderColor: Colors.primary + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },

  entryRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
    gap: 10,
  },
  entryRowLast: {
    borderBottomWidth: 0,
  },
  timeCol: { width: 32, alignItems: 'flex-end', paddingTop: 2 },
  timeHour: { fontSize: 11, color: Colors.textMuted, lineHeight: 14, fontVariant: ['tabular-nums'] },
  timeMin: { fontSize: 11, color: Colors.textMuted, lineHeight: 14, fontVariant: ['tabular-nums'] },
  entryContent: { flex: 1 },
  contentText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  tagText: { fontSize: 11, color: Colors.textMuted },

  deleteAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    alignSelf: 'stretch',
  },

  list: { paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 14, color: Colors.textMuted },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
})
