// PC(Web)では長押しに気づきにくいので、長押しと同じメニューを開く「…」ボタンを出す。スマホでは何も出さない。
import React from 'react'
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export function WebMoreButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  if (Platform.OS !== 'web') return null
  return (
    <Pressable
      onPress={e => { (e as any)?.stopPropagation?.(); onPress() }}
      accessibilityLabel="メニュー"
      hitSlop={8}
      style={({ hovered }: any) => [
        { padding: 6, borderRadius: 8, marginLeft: 4, alignSelf: 'center' },
        hovered && { backgroundColor: '#F3F4F6' },
        style,
      ]}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color="#6B7280" />
    </Pressable>
  )
}
