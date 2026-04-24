import Groq from 'groq-sdk'
import { createInvoiceTool } from './tools/createInvoice.js'
import { checkPaymentTool } from './tools/checkPayment.js'
import { initiateOfframpTool } from './tools/initiateOfframp.js'
import { COUNTRY_NAMES } from './lib/countries.js'
import { getHistory, appendMessages } from './lib/conversations.js'
import type { Country } from './db/supabase.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// ─── Tool definitions para Groq ───────────────────────────────────────────────

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description:
        'Crea una invoice en USDC sobre Solana Pay y genera un QR para el cliente. ' +
        'Usá esto cuando el freelancer menciona haber terminado un trabajo o proyecto.',
      parameters: {
        type: 'object',
        properties: {
          amount_usd: { type: 'number', description: 'Monto de la invoice en USD (se cobra en USDC)' },
          client_name: { type: 'string', description: 'Nombre del cliente o empresa a quien se le factura' },
          country: { type: 'string', description: 'País del freelancer para el off-ramp: AR, MX, BR o CO' },
          description: { type: 'string', description: 'Descripción breve del trabajo realizado (opcional)' },
        },
        required: ['amount_usd', 'client_name', 'country'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_payment_status',
      description:
        'Consulta el estado de las invoices. ' +
        'Usá esto cuando el freelancer pregunta si le pagaron o quiere ver sus cobros.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string', description: 'ID específico de la invoice (opcional — sin esto muestra todas)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'initiate_offramp',
      description:
        'Convierte USDC recibido a moneda local y lo manda a la cuenta bancaria del freelancer. ' +
        'Usá esto cuando el freelancer quiere retirar o cobrar una invoice pagada.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string', description: 'ID de la invoice pagada a convertir' },
        },
        required: ['invoice_id'],
      },
    },
  },
]

// ─── Agent response type ──────────────────────────────────────────────────────

export interface AgentResponse {
  text: string
  invoiceResult?: Awaited<ReturnType<typeof createInvoiceTool>>
  offrampResult?: Awaited<ReturnType<typeof initiateOfframpTool>>
}

// ─── Main agent runner ────────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  telegramId: number,
  country?: Country
): Promise<AgentResponse> {
  const countryContext = country
    ? `País del usuario: ${country} (${COUNTRY_NAMES[country]})`
    : 'País no configurado aún'

  const systemPrompt = `Sos Wagio, asistente de cobros para freelancers en LATAM.
Ayudás a crear invoices en dólares, cobrar pagos de clientes internacionales
y recibir la plata en moneda local automáticamente.

${countryContext}

Tu personalidad:
- Amigable, paciente y directo, siempre en español
- Explicás sin tecnicismos. Nunca menciones "blockchain", "crypto", "USDC", "Solana" salvo que te pregunten explícitamente por eso
- Si alguien pregunta cómo funciona, explicalo en términos simples con un ejemplo corto
- Emojis con moderación
- Por default mensajes cortos, pero si el usuario necesita una explicación más extensa, dala — la claridad gana sobre la brevedad

════════════════════════════════════════════════════════
COBERTURA POR PAÍS (importante)
════════════════════════════════════════════════════════
Wagio deposita en moneda local solo en estos países:
- 🇦🇷 Argentina (ARS, via CBU/CVU)
- 🇲🇽 México (MXN, via CLABE/SPEI)
- 🇧🇷 Brasil (BRL, via PIX)
- 🇨🇴 Colombia (COP, via PSE)

Si el usuario es de OTRO país (Chile, Perú, España, etc.):
- Explicá con empatía que todavía no tenés integración bancaria en su país
- Ofrecé la alternativa: aún podés generar el link de pago en dólares, pero el usuario tendría que retirar el USD a mano con un proveedor externo
- No prometas soporte futuro con fechas específicas
- Invitá al usuario a avisar si quiere que sumemos su país

════════════════════════════════════════════════════════
CÓMO EXPLICAR WAGIO (si preguntan)
════════════════════════════════════════════════════════
Explicación corta estándar:
"Tu cliente paga en dólares desde cualquier parte del mundo con un QR o link.
Nosotros convertimos automáticamente a tu moneda local y te lo depositamos
en tu cuenta bancaria (CBU/CLABE/PIX/PSE). Cobrás en 2 minutos, sin trámites."

Si preguntan por comisiones: "Cobramos 1% del total. Sin costos ocultos."
Si preguntan si es seguro: "Sí, tu cliente paga directo a tu cuenta y vos recibís
la plata en tu banco. No manejamos ni retenemos fondos."
Si preguntan qué tipo de clientes pueden pagar: "Cualquier empresa o persona
en el mundo con acceso a dólares digitales (Binance, Coinbase, etc.)"

════════════════════════════════════════════════════════
FLUJO DE TRABAJO
════════════════════════════════════════════════════════
Cuando el usuario describe trabajo terminado:
1. Extraé: monto, nombre del cliente, e inferí el país si no lo indicó
2. Si falta info crítica (monto o cliente), pedila específicamente
3. Llamá a create_invoice cuando tengas los datos
4. Después mandá un mensaje breve de confirmación

Si te preguntan por cobros pendientes: llamá a check_payment_status
Si quieren retirar o cobrar: llamá a initiate_offramp

Si el usuario parece perdido, confundido o dice cosas como "no entiendo",
"¿qué es esto?", "¿cómo uso esto?": explicá Wagio con un ejemplo concreto
y preguntá en qué lo podés ayudar.

Si falta el país y lo necesitás para create_invoice, preguntá una sola vez:
"¿Desde qué país cobrás? (AR/MX/BR/CO)"`

  const history = getHistory(telegramId)
  const userMessageParam: Groq.Chat.Completions.ChatCompletionMessageParam = {
    role: 'user',
    content: userMessage,
  }

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    userMessageParam,
  ]

  const result: AgentResponse = { text: '' }
  const textParts: string[] = []

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
  })

  const message = completion.choices[0].message

  if (message.content) {
    textParts.push(message.content)
  }

  for (const toolCall of message.tool_calls ?? []) {
    const { name, arguments: argsStr } = toolCall.function
    const args = JSON.parse(argsStr)

    try {
      if (name === 'create_invoice') {
        result.invoiceResult = await createInvoiceTool(args as {
          amount_usd: number
          client_name: string
          country: Country
          description?: string
        }, telegramId)

        const { net_usdc, fee_usdc, amount_usdc, client_name } = result.invoiceResult
        textParts.push(
          `✅ *Factura creada*\n\n` +
          `👤 Cliente: ${client_name}\n` +
          `💵 Monto: $${amount_usdc} USDC\n` +
          `📊 Fee: $${fee_usdc.toFixed(2)} (1%)\n` +
          `💰 Vas a recibir: *$${net_usdc.toFixed(2)} USDC*\n\n` +
          `―――――――――――\n\n` +
          `📲 Compartí el QR con tu cliente para cobrar.\n\n` +
          `_Te aviso cuando llegue el pago_ 🔔`
        )
      }

      if (name === 'check_payment_status') {
        const statusResult = await checkPaymentTool(args.invoice_id, telegramId)
        textParts.push(statusResult.summary)
      }

      if (name === 'initiate_offramp') {
        result.offrampResult = await initiateOfframpTool(args as { invoice_id: string }, telegramId)
        const { netUsdc, rate, localCurrency, localAmount, eta } = result.offrampResult
        textParts.push(
          `🏦 *Retiro en proceso*\n\n` +
          `💵 Monto: $${netUsdc} USDC\n` +
          `📈 Rate: 1 USDC = ${rate.toFixed(2)} ${localCurrency}\n` +
          `💰 Vas a recibir: *${localAmount.toFixed(2)} ${localCurrency}*\n` +
          `⏱ Tiempo estimado: ${eta}\n\n` +
          `―――――――――――\n\n` +
          `_Te aviso cuando acredite en tu cuenta_ 💸`
        )
      }
    } catch (err) {
      textParts.push(`❌ Error: ${(err as Error).message}`)
    }
  }

  result.text = textParts.join('\n\n').trim()
  if (!result.text) {
    result.text =
      '¿En qué puedo ayudarte? Contame sobre tu último trabajo o preguntame por tus cobros pendientes.'
  }

  appendMessages(telegramId, [
    userMessageParam,
    { role: 'assistant', content: result.text },
  ])

  return result
}
