export type Category = '保険' | '契約' | '身分証' | '保証' | 'その他' | 'タスク'
export type TaskType = '買い物' | '手続き' | '家事' | '仕事' | '子ども' | 'その他'

export const CATEGORIES: Category[] = ['保険', '契約', '身分証', '保証', 'その他']
export const RECORD_CATEGORIES: Category[] = CATEGORIES

export const TASK_TYPES: TaskType[] = ['買い物', '手続き', '家事', '仕事', '子ども', 'その他']

export const CATEGORY_COLORS: Record<Category, string> = {
  保険: '#3B82F6',
  契約: '#8B5CF6',
  身分証: '#10B981',
  保証: '#F59E0B',
  その他: '#6B7280',
  タスク: '#F97316',
}

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  買い物: '#10B981',
  手続き: '#8B5CF6',
  家事: '#F59E0B',
  仕事: '#3B82F6',
  子ども: '#EC4899',
  その他: '#6B7280',
}

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  買い物: 'cart-outline',
  手続き: 'document-text-outline',
  家事: 'home-outline',
  仕事: 'briefcase-outline',
  子ども: 'happy-outline',
  その他: 'ellipse-outline',
}

export interface Household {
  id: string
  name: string
  members: string[]
  line_group_id: string | null
  line_target_type: 'group' | 'user' | null
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  joined_at: string
}

export interface ExpirationRecord {
  id: string
  household_id: string
  name: string
  category: Category
  task_type: TaskType | null
  start_date: string | null
  expiration_date: string
  owner: string | null
  amount: number | null
  memo: string | null
  contact: string | null
  pcloud_file_id: string | null
  reminder_days_before: number | null
  completed: boolean
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export function hasStartDate(category: Category): boolean {
  return category === '保険' || category === '契約'
}

export function expirationLabel(category: Category): string {
  if (category === '保険') return '満期日'
  if (category === '契約') return '契約終了日'
  return '期限日'
}

export function startDateLabel(category: Category): string {
  return '契約開始日'
}

export interface PushToken {
  id: string
  user_id: string
  expo_push_token: string
  device_label: string | null
  updated_at: string
}

export interface InviteCode {
  id: string
  household_id: string
  code: string
  created_by: string
  created_at: string
  expires_at: string
  used_at: string | null
}

export interface PasswordEntry {
  id: string
  household_id: string
  site_name: string
  url: string | null
  username: string | null
  password: string
  memo: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Card {
  id: string
  household_id: string
  name: string
  card_number: string
  memo: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface DiaryEntry {
  id: string
  household_id: string
  created_by: string
  date: string
  content: string
  raw_transcript: string | null
  tags: string[]
  pcloud_folder: string | null
  created_at: string
  updated_at: string
}

export interface PhotoEntry {
  id: string
  household_id: string
  entry_date: string
  pcloud_file_id: number
  pcloud_path: string
  created_by: string
  created_at: string
  url?: string  // クライアント側で後から付与するサムネイルURL
}

export const MONEY_EVENT_TYPES = [
  'お年玉', '出産祝い', '結婚祝い', '入学祝い', '卒業祝い',
  '就職祝い', '新築祝い', '快気祝い', '香典', '還暦祝い', '誕生日', 'その他',
] as const
export type MoneyEventType = typeof MONEY_EVENT_TYPES[number]

export const MONEY_EVENT_NEEDS_RETURN: Record<MoneyEventType, boolean> = {
  'お年玉': false, '出産祝い': true, '結婚祝い': true, '入学祝い': true,
  '卒業祝い': true, '就職祝い': true, '新築祝い': true, '快気祝い': true,
  '香典': true, '還暦祝い': true, '誕生日': false, 'その他': false,
}

export interface MoneyRecord {
  id: string
  household_id: string
  created_by: string
  event_type: MoneyEventType
  direction: 'received' | 'given'
  date: string
  person: string
  amount: number
  needs_return: boolean
  return_status: 'pending' | 'done' | null
  return_note: string | null
  return_amount: number | null
  return_date: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export const RECIPE_CATEGORIES = ['肉料理', '魚料理', 'パスタ・麺', 'スープ', 'ご飯もの', '野菜', 'お菓子', 'その他'] as const
export type RecipeCategory = typeof RECIPE_CATEGORIES[number]

export const RECIPE_CATEGORY_COLORS: Record<RecipeCategory, string> = {
  '肉料理': '#EF4444',
  '魚料理': '#3B82F6',
  'パスタ・麺': '#F59E0B',
  'スープ': '#10B981',
  'ご飯もの': '#F97316',
  '野菜': '#22C55E',
  'お菓子': '#EC4899',
  'その他': '#6B7280',
}

export interface Recipe {
  id: string
  household_id: string
  created_by: string
  title: string
  category: RecipeCategory
  url: string | null
  body: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface PcloudFile {
  id: string
  household_id: string
  is_folder: boolean
  fileid: number | null
  folderid: number | null
  parentfolderid: number | null
  name: string
  path: string
  size: number | null
  content_type: string | null
  missing: boolean
  document_id: string | null
  ocr_status: 'pending' | 'processing' | 'done' | 'error' | 'skip' | null
  ocr_error: string | null
  ocr_at: string | null
  ocr_tries: number
  first_seen: string
  last_seen: string
  pc_modified: string | null
}

export interface DocumentRecord {
  id: string
  household_id: string
  source: string | null
  source_ref: string | null
  title: string | null
  doc_type: string | null
  counterparty: string | null
  issued_on: string | null
  amount: number | null
  due_date: string | null
  expires_on: string | null
  summary: string | null
  full_text: string | null
  extracted: Record<string, any> | null
  status: 'needs_review' | 'confirmed' | null
  category: string | null
  person: string | null
  pcloud_path: string | null
  confidence: number | null
  linked_table: string | null
  linked_id: string | null
  processed_at: string | null
  move_approved: boolean
  approved_path: string | null
  created_at: string
  updated_at: string
}

export function daysUntilExpiration(expirationDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expDate = new Date(expirationDate)
  expDate.setHours(0, 0, 0, 0)
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
