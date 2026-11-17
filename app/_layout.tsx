import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { Stack, router, useSegments, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/lib/AuthContext'
import { setAuthStore } from '@/lib/authStore'
import { writeAuthCache, readDeviceHid, writeDeviceHid } from '@/lib/authCache'
import { WebAlertHost } from '@/components/WebAlertHost'

// Web版: ログインしないと何も見えない。匿名ログイン・世帯作成・世帯IDだけでの自動再参加はしない
const IS_WEB = Platform.OS === 'web'
// Web: ログイン前に開こうとしたページ(例: /dashboard)を覚えておき、ログイン後にそこへ戻す
let pendingPath: string | null = null

SplashScreen.preventAutoHideAsync()

if (!IS_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export default function RootLayout() {
  const { session, loading, userId } = useAuth()
  const { household, loading: householdLoading } = useHousehold(userId)
  const signingIn = useRef(false)
  const rejoining = useRef(false)
  const segments = useSegments()
  const firstSegment = segments[0] as string | undefined
  const pathname = usePathname()

  // Anonymous Auth: セッションがなければ自動でサインイン（二重呼び出し防止）
  useEffect(() => {
    if (loading || IS_WEB) return
    if (!session && !signingIn.current) {
      signingIn.current = true
      supabase.auth.signInAnonymously().finally(() => { signingIn.current = false })
    }
  }, [loading, session])

  useEffect(() => {
    if (!loading && !householdLoading) {
      SplashScreen.hideAsync()
    }
  }, [loading, householdLoading])

  useEffect(() => {
    if (loading || householdLoading) return

    if (IS_WEB) return

    if (household) {
      router.replace('/(main)/')
      return
    }

    // household=null: sessionがあればauto-rejoin試みる、なければsetupへ
    if (!session) {
      router.replace('/setup')
      return
    }

    if (rejoining.current) return
    rejoining.current = true

    readDeviceHid().then(async (deviceHid) => {
      if (deviceHid) {
        // 保存済みhousehold_idが実際に存在するか確認してからrejoin
        const { data: hExists } = await supabase
          .from('households')
          .select('id')
          .eq('id', deviceHid)
          .maybeSingle()

        if (hExists) {
          const { error } = await supabase.from('household_members').insert({
            household_id: deviceHid,
            user_id: session.user.id,
          })
          if (!error || error.code === '23505') {
            setAuthStore(session.user.id, deviceHid)
            await writeAuthCache(session.user.id, deviceHid)
            rejoining.current = false
            router.replace('/(main)/')
            return
          }
        }
        // device_hidが指す世帯が存在しない → クリアしてsetupへ
        await writeDeviceHid('')
      }
      rejoining.current = false
      router.replace('/setup')
    })
  }, [session, loading, household, householdLoading])

  // Web版の振り分け: 未ログイン→ログイン画面、世帯なし→招待コード入力、それ以外はそのページのまま
  useEffect(() => {
    if (!IS_WEB || loading || householdLoading) return
    if (!session) {
      if (firstSegment !== '(auth)') {
        if (pathname && pathname !== '/' && firstSegment !== 'join' && firstSegment !== 'setup') pendingPath = pathname
        router.replace('/(auth)/login')
      }
      return
    }
    if (!household) {
      if (firstSegment !== 'join') router.replace('/join')
      return
    }
    // ログイン済み+世帯あり: ログイン画面・参加画面・トップにいるときだけホームへ(リロードしたページはそのまま)
    if (!firstSegment || firstSegment === '(auth)' || firstSegment === 'join' || firstSegment === 'setup') {
      const next = pendingPath
      pendingPath = null
      router.replace((next ?? '/(main)/') as any)
    }
  }, [session, loading, household, householdLoading, firstSegment])

  // グローバルストアとネイティブキャッシュに書き込み（世帯が正常に見つかった場合）
  useEffect(() => {
    if (userId && household) {
      setAuthStore(userId, household.id)
      writeAuthCache(userId, household.id)
      writeDeviceHid(household.id)  // デバイス永続household_idも更新
    }
  }, [userId, household])

  useEffect(() => {
    if (!userId || IS_WEB) return
    registerPushToken(userId)
  }, [userId])

  return (
    <AuthContext.Provider value={{ userId: userId ?? null, household }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(main)" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="join" />
        <Stack.Screen name="record/new" options={{ presentation: 'modal', headerShown: true, title: '新規追加' }} />
        <Stack.Screen name="record/[id]" options={{ presentation: 'modal', headerShown: true, title: '編集' }} />
        <Stack.Screen name="diary/new" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="diary/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="ai-chat" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="card/new" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="password/new" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="password/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="bookmarks" options={{ headerShown: false }} />
      </Stack>
      <WebAlertHost />
    </AuthContext.Provider>
  )
}

async function registerPushToken(userId: string) {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return
  const token = await Notifications.getExpoPushTokenAsync()
  await supabase.from('push_tokens').upsert(
    { user_id: userId, expo_push_token: token.data, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
}
