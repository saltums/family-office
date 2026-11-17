import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// AsyncStorage をプライマリとし、初回のみ SecureStore からマイグレーション
// getSession() がモーダルコンテキストでも確実に動作する
const MigratingStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const val = await AsyncStorage.getItem(key)
      if (val != null) return val
      // AsyncStorage になければ SecureStore を確認してマイグレーション
      const ssVal = await SecureStore.getItemAsync(key)
      if (ssVal != null) {
        await AsyncStorage.setItem(key, ssVal)
      }
      return ssVal ?? null
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value)
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key)
      await SecureStore.deleteItemAsync(key).catch(() => {})
    } catch {}
  },
}

// Web では SecureStore が使えないので AsyncStorage(=localStorage)だけを使う
const storage = Platform.OS === 'web' ? AsyncStorage : MigratingStorageAdapter

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
