// Web版だけで使う「Alert.alert の代わり」。
// react-native-web の Alert.alert は何もしないので、Web では Alert.alert を差し替えて
// 小さなダイアログ(モーダル)で出す。既存の Alert.alert 呼び出しはそのまま動く。
import React, { useEffect, useState } from 'react'
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

type Btn = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: (value?: string) => void }
type Req = { title: string; message?: string; buttons: Btn[]; cancelable: boolean }

const queue: Req[] = []
let notify: (() => void) | null = null

if (Platform.OS === 'web') {
  ;(Alert as any).alert = (title: string, message?: string, buttons?: Btn[], options?: { cancelable?: boolean }) => {
    const btns = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }]
    queue.push({ title: title ?? '', message, buttons: btns, cancelable: options?.cancelable ?? true })
    notify?.()
  }
}

export function WebAlertHost() {
  const [current, setCurrent] = useState<Req | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    notify = () => setCurrent(c => c ?? queue.shift() ?? null)
    notify()
    return () => { notify = null }
  }, [])

  if (Platform.OS !== 'web' || !current) return null

  function close(btn?: Btn) {
    setCurrent(queue.shift() ?? null)
    btn?.onPress?.()
  }

  const cancelBtn = current.buttons.find(b => b.style === 'cancel')
  // ボタンが3つ以上なら縦並び(メニュー風)、2つまでは横並び
  const vertical = current.buttons.length > 2

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => close(cancelBtn)}>
      <Pressable
        style={styles.backdrop}
        onPress={() => { if (current.cancelable || cancelBtn) close(cancelBtn) }}
      >
        <Pressable style={styles.box} onPress={() => {}}>
          {!!current.title && <Text style={styles.title}>{current.title}</Text>}
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}
          <View style={[styles.btnRow, vertical && styles.btnCol]}>
            {current.buttons.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => close(b)}
                style={({ hovered }: any) => [
                  styles.btn,
                  vertical && styles.btnFull,
                  b.style === 'cancel' && styles.btnCancel,
                  hovered && styles.btnHover,
                ]}
              >
                <Text
                  style={[
                    styles.btnText,
                    b.style === 'destructive' && styles.btnDanger,
                    b.style === 'cancel' && styles.btnCancelText,
                  ]}
                >
                  {b.text ?? 'OK'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 360 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
  message: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 4 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btnCol: { flexDirection: 'column', alignItems: 'stretch' },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#EEF2FF' },
  btnFull: { alignItems: 'center' },
  btnCancel: { backgroundColor: '#F3F4F6' },
  btnHover: { opacity: 0.8 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#4F8EF7' },
  btnDanger: { color: '#EF4444' },
  btnCancelText: { color: '#6B7280' },
})
