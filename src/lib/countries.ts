import type { Country } from '../db/supabase.js'

export const COUNTRY_NAMES: Record<Country, string> = {
  AR: 'Argentina',
  MX: 'México',
  BR: 'Brasil',
  CO: 'Colombia',
}

export const COUNTRY_FLAGS: Record<Country, string> = {
  AR: '🇦🇷',
  MX: '🇲🇽',
  BR: '🇧🇷',
  CO: '🇨🇴',
}

export const LOCAL_CURRENCY: Record<Country, string> = {
  AR: 'ARS',
  MX: 'MXN',
  BR: 'BRL',
  CO: 'COP',
}

export const BANK_LABELS: Record<Country, string> = {
  AR: 'CBU o CVU',
  MX: 'CLABE interbancaria',
  BR: 'chave PIX',
  CO: 'número de cuenta PSE',
}

export const BANK_EXAMPLES: Record<Country, string> = {
  AR: '0000003100012345678901',
  MX: '646180110400000001',
  BR: 'email@tudominio.com o CPF',
  CO: '1234567890 (Bancolombia)',
}

export const BANK_TYPES: Record<Country, 'cvu' | 'spei' | 'pix' | 'pse'> = {
  AR: 'cvu',
  MX: 'spei',
  BR: 'pix',
  CO: 'pse',
}
