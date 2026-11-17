import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@fo/auth_v1'
// デバイスに永続保存するhousehold_id（ユーザーセッションに関係なく残る）
const DEVICE_HID_KEY = '@fo/device_hid'

export async function writeAuthCache(userId: string, householdId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ userId, householdId }))
  } catch {}
}

export async function clearAuthCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {}
}

export async function readAuthCache(): Promise<{ userId: string; householdId: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// デバイスレベルの永続household_id（セッション期限切れ後も保持）
export async function writeDeviceHid(householdId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_HID_KEY, householdId)
  } catch {}
}

export async function readDeviceHid(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_HID_KEY)
  } catch {
    return null
  }
}
