import { GoogleGenerativeAI, FunctionCallingMode, SchemaType } from '@google/generative-ai'
import { createInvoiceTool } from './tools/createInvoice.js'
import { checkPaymentTool } from './tools/checkPayment.js'
import { initiateOfframpTool } from './tools/initiateOfframp.js'
import type { Country } from './db/supabase.js'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

// ─── Tool definitions para Gemini ────────────────────────────────────────────

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'create_invoice',
        description:
          'Crea una invoice en USDC sobre Solana Pay y genera un QR para el cliente. ' +
          'Usá esto cuando el freelancer menciona haber terminado un trabajo o proyecto.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            amount_usd: {
              type: SchemaType.NUMBER,
              description: 'Monto de la invoice en USD (se cobra en USDC)',
            },
            client_name: {
              type: SchemaType.STRING,
              description: 'Nombre del cliente o empresa a quien se le factura',
            },
            country: {
              type: SchemaType.STRING,
              description: 'País del freelancer para el off-ramp: AR, MX, BR o CO',
            },
            description: {
              type: SchemaType.STRING,
              description: 'Descripción breve del trabajo realizado (opcional)',
            },
          },
          required: ['amount_usd', 'client_name', 'country'],
        },
      },
      {
        name: 'check_payment_status',
        description:
          'Consulta el estado de las invoices. ' +
          'Usá esto cuando el freelancer pregunta si le pagaron o quiere ver sus cobros.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            invoice_id: {
              type: SchemaType.STRING,
              description: 'ID específico de la invoice (opcional — sin esto muestra todas)',
            },
          },
          required: [],
        },
      },
      {
        name: 'initiate_offramp',
        description:
          'Convierte USDC recibido a moneda local y lo manda a la cuenta bancaria del freelancer. ' +
          'Usá esto cuando el freelancer quiere retirar o cobrar una invoice pagada.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            invoice_id: {
              type: SchemaType.STRING,
              description: 'ID de la invoice pagada a convertir',
            },
          },
          required: ['invoice_id'],
        },
      },
    ],
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
- Amigable y directo, siempre en español
- Nunca menciones "blockchain", "crypto", "USDC", "Solana" salvo que te pregunten
- Foco en: "terminaste un trabajo → acá está el link de pago → recibís pesos/reales/etc."
- Mensajes cortos, sin paredes de texto
- Emojis con moderación

Cuando el usuario describe trabajo terminado:
1. Extraé: monto, nombre del cliente, e inferí el país si no lo indicó
2. Llamá a create_invoice de inmediato, sin pedir confirmación
3. Después mandá un mensaje breve de confirmación

Si te preguntan por cobros pendientes: llamá a check_payment_status
Si quieren retirar o cobrar: llamá a initiate_offramp

Si falta el país y lo necesitás para create_invoice, preguntá una sola vez:
"¿Desde qué país cobrás? (AR/MX/BR/CO)"`

  // Inicializar modelo con tools y system prompt
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: TOOLS,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    systemInstruction: systemPrompt,
  })

  const chat = model.startChat()
  const geminiResult = await chat.sendMessage(userMessage)
  const response = geminiResult.response

  const result: AgentResponse = { text: '' }
  const textParts: string[] = []

  const parts = response.candidates?.[0]?.content?.parts ?? []

  for (const part of parts) {
    // Texto directo del modelo
    if (part.text) {
      textParts.push(part.text)
    }

    // Tool calls
    if (part.functionCall) {
      const { name, args } = part.functionCall

      try {
        if (name === 'create_invoice') {
          const input = args as {
            amount_usd: number
            client_name: string
            country: Country
            description?: string
          }

          result.invoiceResult = await createInvoiceTool(input, telegramId)

          const { net_usdc, fee_usdc, amount_usdc, client_name } = result.invoiceResult
          textParts.push(
            `✅ *Factura creada*\n` +
            `Cliente: ${client_name}\n` +
            `Monto: $${amount_usdc} USDC\n` +
            `Fee: $${fee_usdc.toFixed(2)} (0.99%)\n` +
            `Vas a recibir: *$${net_usdc.toFixed(2)} USDC*\n\n` +
            `📲 Compartí el QR con tu cliente para cobrar.\n` +
            `_Te aviso cuando llegue el pago_ 🔔`
          )
        }

        if (name === 'check_payment_status') {
          const input = args as { invoice_id?: string }
          const statusResult = await checkPaymentTool(input.invoice_id, telegramId)
          textParts.push(statusResult.summary)
        }

        if (name === 'initiate_offramp') {
          const input = args as { invoice_id: string }
          result.offrampResult = await initiateOfframpTool(input, telegramId)
          const { netUsdc, rate, localCurrency, localAmount, eta } = result.offrampResult
          textParts.push(
            `🏦 *Retiro en proceso*\n\n` +
            `Monto: $${netUsdc} USDC\n` +
            `Rate: 1 USDC = ${rate.toFixed(2)} ${localCurrency}\n` +
            `Vas a recibir: *${localAmount.toFixed(2)} ${localCurrency}*\n` +
            `Tiempo estimado: ${eta}\n\n` +
            `_Te aviso cuando acredite en tu cuenta_ 💸`
          )
        }
      } catch (err) {
        textParts.push(`❌ Error: ${(err as Error).message}`)
      }
    }
  }

  result.text = textParts.join('\n\n').trim()
  if (!result.text) {
    result.text =
      '¿En qué puedo ayudarte? Contame sobre tu último trabajo o preguntame por tus cobros pendientes.'
  }

  return result
}

const COUNTRY_NAMES: Record<Country, string> = {
  AR: 'Argentina',
  MX: 'México',
  BR: 'Brasil',
  CO: 'Colombia',
}
