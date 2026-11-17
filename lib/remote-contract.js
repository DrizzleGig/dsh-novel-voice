/**
 * Typert remote contract for the 创作风格 sidebar. Mirrored in client.js —
 * keep both copies in sync (the browser factory cannot import a Host module).
 */

function scalar(validate) {
  return {
    parse(value) {
      validate(value)
      return value
    },
    safeParse(value) {
      try {
        validate(value)
        return { success: true, data: value }
      } catch (error) {
        return { success: false, error }
      }
    },
  }
}

const sessionIdSchema = scalar((value) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('sessionId must be a non-empty string')
})

const booleanSchema = scalar((value) => {
  if (typeof value !== 'boolean') throw new Error('on must be a boolean')
})

const jsonObjectSchema = scalar((value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected a JSON object')
})

const modeResultSchema = scalar((value) => {
  if (!value || typeof value.on !== 'boolean') throw new Error('result must be { on: boolean }')
})

const panelResultSchema = scalar((value) => {
  if (!value || typeof value !== 'object') throw new Error('panel result must be an object')
})

function strictCodec(typeSymbol, schema) {
  return { mode: 'strict', typeSymbol, create: () => schema }
}

function parameter(name, schema) {
  return { name, wire: name, source: 'json', codec: strictCodec(name, schema) }
}

const methods = [
  ['status', 'voiceStudio', [parameter('sessionId', sessionIdSchema)], modeResultSchema],
  ['setMode', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('on', booleanSchema)], modeResultSchema],
  ['panel', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['brief', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['saveWeights', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['setRuleStatus', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['addBan', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['aggregate', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['acceptCandidate', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['rejectCandidate', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['importFolder', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['importPath', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['importTexts', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['extractTechniques', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['measureWorks', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['removeWork', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
  ['createProfile', 'voiceStudio', [parameter('sessionId', sessionIdSchema), parameter('options', jsonObjectSchema)], panelResultSchema],
]

export const DESCRIPTORS = methods.map(([method, service, parameters, result]) => ({
  id: `dsh-novel-voice#${service}/${method}`,
  namespace: service,
  service,
  method,
  invocation: { kind: 'direct' },
  parameters,
  result: strictCodec(method === 'status' || method === 'setMode' ? 'VoiceMode' : 'VoicePanel', result),
}))

export const TYPERT_REMOTE = { package: 'dsh-novel-voice', descriptors: DESCRIPTORS }
