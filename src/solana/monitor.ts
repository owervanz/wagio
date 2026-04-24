import axios from 'axios'

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!
const HELIUS_AUTH_HEADER = process.env.HELIUS_AUTH_HEADER!
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL!
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS!
const HELIUS_BASE = `https://api.helius.xyz/v0`

interface HeliusWebhook {
  webhookID: string
  webhookURL: string
  authHeader?: string
}

// ─── Register Helius webhook on startup ───────────────────────────────────────

export async function registerWebhook(): Promise<void> {
  const webhookUrl = `${WEBHOOK_BASE_URL}/webhook/payment`

  try {
    const { data: existing } = await axios.get<HeliusWebhook[]>(`${HELIUS_BASE}/webhooks`, {
      params: { 'api-key': HELIUS_API_KEY },
    })

    const current = existing?.find(wh => wh.webhookURL === webhookUrl)

    if (current) {
      // Ensure authHeader is up to date (covers rotation)
      if (current.authHeader !== HELIUS_AUTH_HEADER) {
        await axios.put(
          `${HELIUS_BASE}/webhooks/${current.webhookID}`,
          {
            webhookURL: webhookUrl,
            transactionTypes: ['TRANSFER'],
            accountAddresses: [MERCHANT_WALLET],
            webhookType: 'enhanced',
            authHeader: HELIUS_AUTH_HEADER,
          },
          { params: { 'api-key': HELIUS_API_KEY } }
        )
        console.log('🔄 Helius webhook authHeader updated')
      } else {
        console.log('✅ Helius webhook already registered')
      }
      return
    }

    await axios.post(
      `${HELIUS_BASE}/webhooks`,
      {
        webhookURL: webhookUrl,
        transactionTypes: ['TRANSFER'],
        accountAddresses: [MERCHANT_WALLET],
        webhookType: 'enhanced',
        authHeader: HELIUS_AUTH_HEADER,
      },
      { params: { 'api-key': HELIUS_API_KEY } }
    )

    console.log('✅ Helius webhook registered:', webhookUrl)
  } catch (err) {
    console.warn('⚠️  Could not register Helius webhook:', (err as Error).message)
    console.warn('   In development, use ngrok to expose localhost')
  }
}

// ─── Parse Helius enhanced transaction ────────────────────────────────────────

export interface ParsedPayment {
  txSignature: string
  amountUsdc: number
  memoField?: string
  accountData: Array<{ account: string; nativeBalanceChange: number }>
}

export function parseHeliusPayment(rawTx: Record<string, unknown>): ParsedPayment | null {
  try {
    const signature = rawTx.signature as string
    const tokenTransfers = rawTx.tokenTransfers as Array<{
      mint: string
      tokenAmount: number
      toUserAccount: string
    }> | undefined

    if (!tokenTransfers?.length) return null

    // Filter for USDC transfers to merchant wallet
    const usdcTransfer = tokenTransfers.find(
      t =>
        t.mint === process.env.USDC_MINT &&
        t.toUserAccount === MERCHANT_WALLET
    )

    if (!usdcTransfer) return null

    // Extract memo from instructions
    const instructions = rawTx.instructions as Array<{
      programId: string
      data?: string
    }> | undefined

    let memoField: string | undefined
    const memoInstruction = instructions?.find(
      i => i.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    )
    if (memoInstruction?.data) {
      try {
        memoField = Buffer.from(memoInstruction.data, 'base64').toString('utf8')
      } catch {
        memoField = undefined
      }
    }

    return {
      txSignature: signature,
      amountUsdc: usdcTransfer.tokenAmount,
      memoField,
      accountData: (rawTx.accountData as ParsedPayment['accountData']) ?? [],
    }
  } catch {
    return null
  }
}
