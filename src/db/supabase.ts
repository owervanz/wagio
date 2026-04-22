import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

export const db = createClient(supabaseUrl, supabaseKey)

// ─── Types ────────────────────────────────────────────────────────────────────

export type Country = 'AR' | 'MX' | 'BR' | 'CO'
export type InvoiceStatus = 'pending' | 'paid' | 'offramp_pending' | 'completed' | 'failed'

export interface User {
  id: string
  telegram_id: number
  username?: string
  full_name?: string
  email?: string
  country?: Country
  wallet_address?: string
  bank_account?: BankAccount
  onboarding_step: string
  created_at: string
}

export interface BankAccount {
  type: 'cvu' | 'spei' | 'pix' | 'pse'
  account: string
  holder_name?: string
}

export interface Invoice {
  id: string
  user_id: string
  client_name: string
  description?: string
  amount_usdc: number
  country: Country
  solana_pay_url: string
  reference_pubkey: string
  status: InvoiceStatus
  tx_signature?: string
  paid_at?: string
  local_amount?: number
  local_currency?: string
  offramp_id?: string
  offramp_rate?: number
  fee_usdc?: number
  created_at: string
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function getOrCreateUser(telegramId: number, username?: string, fullName?: string): Promise<User> {
  const { data: existing } = await db
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (existing) return existing as User

  const { data: created, error } = await db
    .from('users')
    .insert({ telegram_id: telegramId, username, full_name: fullName })
    .select()
    .single()

  if (error) throw new Error(`Failed to create user: ${error.message}`)
  return created as User
}

export async function updateUser(telegramId: number, updates: Partial<User>): Promise<User> {
  const { data, error } = await db
    .from('users')
    .update(updates)
    .eq('telegram_id', telegramId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update user: ${error.message}`)
  return data as User
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data } = await db
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  return data as User | null
}

// ─── Invoice helpers ──────────────────────────────────────────────────────────

export async function createInvoice(invoice: Omit<Invoice, 'id' | 'created_at' | 'status'>): Promise<Invoice> {
  const { data, error } = await db
    .from('invoices')
    .insert({ ...invoice, status: 'pending' })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)
  return data as Invoice
}

export async function getInvoiceByReference(referencePubkey: string): Promise<Invoice | null> {
  const { data } = await db
    .from('invoices')
    .select('*')
    .eq('reference_pubkey', referencePubkey)
    .single()

  return data as Invoice | null
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<void> {
  const { error } = await db
    .from('invoices')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(`Failed to update invoice: ${error.message}`)
}

export async function getUserInvoices(userId: string, limit = 5): Promise<Invoice[]> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to get invoices: ${error.message}`)
  return (data || []) as Invoice[]
}

export async function getPendingInvoices(userId: string): Promise<Invoice[]> {
  const { data } = await db
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (data || []) as Invoice[]
}
