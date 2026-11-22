import { useEffect } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Tabs, router, useSegments } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { setAuthStore, getAuthStore } from '@/lib/authStore'

export default function MainLayout() {
  const segments = useSegments()
  const currentTab = segments[segments.length - 1]
  const hideFab = currentTab === 'shopping'

  useEffect(() => {
    async function populateAuth(uid: string) {
      const current = getAuthStore()
      if (current?.userId === uid && current?.householdId) return
      const { data } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', uid)
        .single()
      if (data?.household_id) setAuthStore(uid, data.household_id)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.id) populateAuth(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id) populateAuth(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarStyle: {
            backgroundColor: Colors.card,
            borderTopColor: Colors.border,
            paddingBottom: 4,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        {/* ホーム — アクティブ時に丸囲み */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'ホーム',
            tabBarIcon: ({ focused }) => (
              <View style={[styles.homeCircle, focused ? styles.homeCircleActive : styles.homeCircleInactive]}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={focused ? '#fff' : Colors.textMuted} />
              </View>
            ),
            tabBarActiveTintColor: Colors.primary,
          }}
        />
        <Tabs.Screen
          name="todo"
          options={{
            title: 'TODO',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="checkmark-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="diary"
          options={{
            title: '日記',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="shopping"
          options={{
            title: '買い物',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cart-outline" size={size} color={color} />
            ),
          }}
        />

        {/* フッターバーに出さないタブ */}
        <Tabs.Screen name="calendar"  options={{ href: null }} />
        <Tabs.Screen name="records"   options={{ href: null }} />
        <Tabs.Screen name="other"     options={{ href: null }} />
        <Tabs.Screen name="settings"  options={{ href: null }} />
        <Tabs.Screen name="recipes"   options={{ href: null }} />
        <Tabs.Screen name="money"     options={{ href: null }} />
        <Tabs.Screen name="documents" options={{ href: null }} />
      </Tabs>

      {/* AI チャット FAB — 買い物タブでは非表示 */}
      {!hideFab && <TouchableOpacity
        style={styles.chatFab}
        onPress={() => {
          const auth = getAuthStore()
          router.push({
            pathname: '/ai-chat' as any,
            params: { uid: auth?.userId ?? '', hid: auth?.householdId ?? '' },
          })
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles" size={22} color="#fff" />
      </TouchableOpacity>}
    </View>
  )
}

const styles = StyleSheet.create({
  homeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCircleActive: {
    backgroundColor: Colors.primary,
  },
  homeCircleInactive: {
    backgroundColor: Colors.border,
  },
  chatFab: {
    position: 'absolute',
    left: 20,
    bottom: 90,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
})
