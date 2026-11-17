import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getAuthStore } from '@/lib/authStore'
import { RECIPE_CATEGORIES, RECIPE_CATEGORY_COLORS, RecipeCategory } from '@/lib/types'
import { Colors, Radius, Spacing } from '@/lib/theme'

type InputMode = 'url' | 'text'

export default function NewRecipeScreen() {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<RecipeCategory>('その他')
  const [mode, setMode] = useState<InputMode>('url')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { Alert.alert('入力エラー', '料理名を入力してください'); return }
    if (mode === 'url' && !url.trim()) { Alert.alert('入力エラー', 'URLを入力してください'); return }
    if (mode === 'text' && !body.trim()) { Alert.alert('入力エラー', 'レシピ内容を入力してください'); return }

    const auth = getAuthStore()
    if (!auth?.userId || !auth?.householdId) {
      Alert.alert('エラー', 'ログアウトされています。再起動してください。')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('recipes').insert({
        household_id: auth.householdId,
        created_by: auth.userId,
        title: title.trim(),
        category,
        url: mode === 'url' ? url.trim() : null,
        body: mode === 'text' ? body.trim() : null,
        memo: memo.trim() || null,
      })
      if (error) throw error
      router.back()
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>レシピを追加</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>保存</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* 料理名 */}
          <View style={styles.card}>
            <Text style={styles.label}>料理名 *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="例：唐揚げ、カルボナーラ"
              placeholderTextColor={Colors.placeholder}
              autoFocus
            />
          </View>

          {/* カテゴリ */}
          <View style={styles.card}>
            <Text style={styles.label}>カテゴリ</Text>
            <View style={styles.chipGrid}>
              {RECIPE_CATEGORIES.map(cat => {
                const color = RECIPE_CATEGORY_COLORS[cat]
                const active = category === cat
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, active && { backgroundColor: color + '22', borderColor: color }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, active && { color }]}>{cat}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* URL / テキスト切り替え */}
          <View style={styles.card}>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'url' && styles.modeBtnActive]}
                onPress={() => setMode('url')}
              >
                <Ionicons name="link-outline" size={16} color={mode === 'url' ? '#fff' : Colors.textMuted} />
                <Text style={[styles.modeBtnText, mode === 'url' && styles.modeBtnTextActive]}>URL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
                onPress={() => setMode('text')}
              >
                <Ionicons name="document-text-outline" size={16} color={mode === 'text' ? '#fff' : Colors.textMuted} />
                <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>テキスト</Text>
              </TouchableOpacity>
            </View>

            {mode === 'url' ? (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>URL *</Text>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://..."
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>レシピ内容 *</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={body}
                  onChangeText={setBody}
                  placeholder="材料・手順など自由に"
                  placeholderTextColor={Colors.placeholder}
                  multiline
                  textAlignVertical="top"
                />
              </>
            )}
          </View>

          {/* メモ */}
          <View style={styles.card}>
            <Text style={styles.label}>メモ（任意）</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={memo}
              onChangeText={setMemo}
              placeholder="アレンジ、子供向け変更など"
              placeholderTextColor={Colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: '#F43F5E', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputMulti: { minHeight: 100, lineHeight: 22 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.bg,
    borderRadius: Radius.md, padding: 3, gap: 3,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: Radius.sm,
  },
  modeBtnActive: { backgroundColor: '#F43F5E' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  modeBtnTextActive: { color: '#fff' },
})
