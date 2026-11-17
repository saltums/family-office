// Web版では音声入力を使わない(マイクボタンも隠している)。呼ばれても何もしない代わりのオブジェクト。
const noop = async () => {}
const Voice: any = {
  start: noop,
  stop: noop,
  cancel: noop,
  destroy: noop,
  removeAllListeners: () => {},
  isAvailable: async () => 0,
  isRecognizing: async () => 0,
}
export default Voice
