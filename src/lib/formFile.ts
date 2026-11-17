import { Platform } from 'react-native'

// FormData に画像ファイルを入れる。スマホは { uri, name, type }、Web は実際のファイル(Blob)が必要。
export async function appendImageFile(form: FormData, field: string, uri: string, name: string, type = 'image/jpeg') {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob()
    form.append(field, new File([blob], name, { type: blob.type || type }))
  } else {
    form.append(field, { uri, name, type } as any)
  }
}
