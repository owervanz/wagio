import type Groq from 'groq-sdk'

type Message = Groq.Chat.Completions.ChatCompletionMessageParam

const MAX_TURNS = 8          // last 8 user/assistant turns (16 messages)
const TTL_MS = 60 * 60 * 1000  // 1 hour of inactivity → reset

interface Conversation {
  messages: Message[]
  lastActivity: number
}

const store = new Map<number, Conversation>()

export function getHistory(telegramId: number): Message[] {
  const conv = store.get(telegramId)
  if (!conv) return []

  if (Date.now() - conv.lastActivity > TTL_MS) {
    store.delete(telegramId)
    return []
  }

  return conv.messages
}

export function appendMessages(telegramId: number, newMessages: Message[]): void {
  const existing = store.get(telegramId)
  const messages = existing && Date.now() - existing.lastActivity <= TTL_MS
    ? [...existing.messages, ...newMessages]
    : newMessages

  // Keep only the last MAX_TURNS × 2 messages (each turn = user + assistant)
  const trimmed = messages.slice(-MAX_TURNS * 2)

  store.set(telegramId, {
    messages: trimmed,
    lastActivity: Date.now(),
  })
}

export function resetConversation(telegramId: number): void {
  store.delete(telegramId)
}
