type AuthData = { userId: string; householdId: string } | null

let _auth: AuthData = null
const _listeners = new Set<() => void>()

export function setAuthStore(userId: string, householdId: string) {
  _auth = { userId, householdId }
  _listeners.forEach((fn) => fn())
}

export function clearAuthStore() {
  _auth = null
  _listeners.forEach((fn) => fn())
}

export function getAuthStore(): AuthData {
  return _auth
}

export function subscribeAuthStore(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
