window.__ModuleLoader__.load({
  id: 'dsh-novel-voice',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /* ════════════════════════════════════════════════════════════════════════
     * 0. Remote contract — keep in sync with lib/remote-contract.js.
     *    Duplicated because this browser factory cannot import a Host module.
     * ════════════════════════════════════════════════════════════════════════ */
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
    const codec = (typeSymbol, schema) => ({ mode: 'strict', typeSymbol, create: () => schema })
    const param = (name, schema) => ({ name, wire: name, source: 'json', codec: codec(name, schema) })
    const TYPERT_REMOTE = {
      package: 'dsh-novel-voice',
      descriptors: [
        ['status', [param('sessionId', sessionIdSchema)], modeResultSchema, 'VoiceMode'],
        ['setMode', [param('sessionId', sessionIdSchema), param('on', booleanSchema)], modeResultSchema, 'VoiceMode'],
        ['panel', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['brief', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['mirror', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['chapterText', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['verifyEvidence', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['saveWeights', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['setRuleStatus', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['addBan', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['aggregate', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['acceptCandidate', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['rejectCandidate', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['importFolder', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['importPath', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['importTexts', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['measureWorks', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['extractTechniques', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['removeWork', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
        ['createProfile', [param('sessionId', sessionIdSchema), param('options', jsonObjectSchema)], panelResultSchema, 'VoicePanel'],
      ].map(([method, parameters, result, typeSymbol]) => ({
        id: `dsh-novel-voice#voiceStudio/${method}`,
        namespace: 'voiceStudio',
        service: 'voiceStudio',
        method,
        invocation: { kind: 'direct' },
        parameters,
        result: codec(typeSymbol, result),
      })),
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 1. 排字房 theme + primitives
     * ════════════════════════════════════════════════════════════════════════ */
    const T = {
      bg: 'var(--dsw-alias-bg-base, #f3eee4)',
      card: 'var(--dsw-alias-bg-l1, rgba(148,163,184,.06))',
      card2: 'var(--dsw-alias-bg-l2, rgba(148,163,184,.10))',
      ink: 'var(--dsw-alias-label-primary, #201d19)',
      muted: 'var(--dsw-alias-label-secondary, #746c60)',
      faint: 'var(--dsw-alias-label-tertiary, #9a9284)',
      line: 'var(--dsw-alias-border-l1, #d5cab8)',
      line2: 'var(--dsw-alias-border-l2, #c4b7a2)',
      accent: 'var(--dsw-alias-brand-primary, #2d4d72)',
      accentSoft: 'var(--dsw-alias-bg-accent, rgba(45,77,114,.10))',
      accentInk: 'var(--dsw-alias-label-inverse, #f7f4ee)',
      mark: 'var(--dsw-alias-state-warning, #a2653b)',
      ok: 'var(--dsw-alias-state-success, #3f6b57)',
      block: 'var(--dsw-alias-state-danger, #a33d3d)',
      serif: 'SimSun, 宋体, "Noto Serif SC", serif',
      sans: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
      mono: '"Cascadia Mono", Consolas, monospace',
    }
    const MODE_COLOR = { 'm-immersive': T.accent, 'm-tight': T.mark, 'm-restrained': T.ok }
    const SCENE_ORDER = ['日常过渡', '动作战斗', '悬疑对峙', '对话', '心理情感', '描写环境']
    const SCENE_LABEL = { 日常过渡: '日常', 动作战斗: '战斗', 悬疑对峙: '对峙', 对话: '对话', 心理情感: '心理', 描写环境: '描写' }
    const ACTION_LABEL = {
      create: '建立档案', confirm: '确认档案', update: '更新总则', weights: '调整权重',
      'add-rules': '加入技法', 'rule-status': '改规则状态', regenerate: '重建锚点/样段', rollback: '回滚',
      'profile-write': '写档案',
    }
    const DETECTOR_LABEL = {
      'cliche-density': '套话密度',
      'negation-parallel': '否定—修正',
      'paragraph-closure': '段末升华',
      'emotion-naming': '抽象情绪直述',
      repetition: '重复',
      overlap: '20 字重合',
      contract: '同人禁忌',
    }
    const PANEL_CSS = `
      .dsh-voice-panel button:focus { outline: none; }
      .dsh-voice-panel button:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 1px; }
      .dsh-voice-panel input[type="range"] { accent-color: ${T.accent}; }
      .dsh-voice-panel ::selection { background: ${T.accentSoft}; }
      .dsh-voice-panel .dsh-tab, .dsh-voice-panel .dsh-seg { border: 0; }
    `

    const unwrap = (result) => {
      if (result && result.ok === false) throw new Error(result.error?.message ?? result.message ?? 'remote 调用失败')
      return result && result.ok === true && 'value' in result ? result.value : result
    }
    const fmtChars = (value) => {
      const n = Number(value) || 0
      if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`
      return `${n} 字`
    }
    const fmtTime = (value) => {
      if (!value) return '—'
      try { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(value) }
    }
    const bytesToBase64 = (bytes) => {
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      return btoa(binary)
    }
    const modeName = (id) => ({ 'm-immersive': '沉浸', 'm-tight': '紧凑', 'm-restrained': '克制' }[id] ?? id)
    const roleName = (role) => (role === 'own' ? '我的' : '参考')
    const ruleStatusLabel = (status) => ({
      confirmed: '已确认', candidate: '待确认', rejected: '已忽略', stale: '已过期', disabled: '已停用',
    }[status] ?? status)

    const PATHS = {
      book: ['M4.5 5.5h5.2a2 2 0 0 1 2 2V19a2.6 2.6 0 0 0-2.6-2.2H4.5z', 'M19.5 5.5h-5.2a2 2 0 0 0-2 2V19a2.6 2.6 0 0 1 2.6-2.2h4.6z'],
      sliders: ['M4 7h9.5', 'M17.5 7H20', 'M4 17h2.5', 'M10.5 17H20', 'M15.5 5v4', 'M8.5 15v4'],
      spark: ['M12 3.5l1.7 4.9 4.9 1.7-4.9 1.7L12 16.7l-1.7-4.9L5.4 10l4.9-1.7z', 'M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'],
      plus: ['M12 5v14', 'M5 12h14'],
      folder: ['M3.5 7.5h5.2l1.8 2H20.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z'],
      refresh: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.5V9h-4.5'],
      pen: ['M4.5 19.5l4.2-1 9.6-9.6-3.2-3.2-9.6 9.6z', 'M14.2 5.9l3.9 3.9'],
      check: ['M5 12.5l4.3 4.3L19 7'],
      alert: ['M12 4.5l8.5 15h-17z', 'M12 10.5v4', 'M12 17.2h.01'],
      close: ['M6 6l12 12', 'M18 6L6 18'],
      arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
      arrowLeft: ['M19 12H5', 'M11 6l-6 6 6 6'],
      link: ['M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2', 'M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2'],
      clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z'],
      copy: ['M8 8h11v11H8z', 'M5 16V5h11'],
      trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13'],
      search: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', 'M20 20l-4-4'],
      file: ['M6 3.5h8l4 4V20H6z', 'M14 3.5V8h4'],
      history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4.5V10H9'],
    }

    function Icon({ name, size = 14, style }) {
      const paths = PATHS[name] ?? PATHS.spark
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', style,
      }, paths.map((d, index) => h('path', { key: index, d })))
    }

    function Btn({ children, primary, ghost, quiet, disabled, onClick, title, style, type = 'button' }) {
      const base = {
        appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans,
        fontSize: 11.5, lineHeight: '18px', borderRadius: 2, padding: '8px 11px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: `1px solid ${T.line2}`, background: 'transparent', color: T.ink,
        opacity: disabled ? 0.5 : 1, transition: 'opacity .15s ease, background .15s ease',
      }
      if (primary) Object.assign(base, { background: T.accent, borderColor: T.accent, color: T.accentInk })
      if (ghost) Object.assign(base, { background: T.card2 })
      if (quiet) Object.assign(base, { borderColor: 'transparent', background: 'transparent', color: T.muted, padding: '4px 6px' })
      return h('button', { type, onClick, disabled, title, style: { ...base, ...style } }, children)
    }

    function IconBtn({ icon, onClick, title, size = 14, style }) {
      return h('button', {
        type: 'button', onClick, title,
        style: {
          appearance: 'none', cursor: 'pointer', width: 26, height: 26, borderRadius: 2,
          border: `1px solid ${T.line}`, background: 'transparent', color: T.muted,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style,
        },
      }, h(Icon, { name: icon, size }))
    }

    function Tag({ children, tone = 'line', style }) {
      const map = {
        line: { color: T.muted, borderColor: T.line2 },
        accent: { color: T.accent, borderColor: T.accent },
        mark: { color: T.mark, borderColor: T.mark },
        ok: { color: T.ok, borderColor: T.ok },
        muted: { color: T.faint, borderColor: T.line },
      }
      const toneStyle = map[tone] ?? map.line
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8.5, lineHeight: '14px',
          padding: '0 4px', border: `1px solid ${toneStyle.borderColor}`, color: toneStyle.color,
          borderRadius: 2, fontFamily: T.mono, letterSpacing: '.04em', whiteSpace: 'nowrap', ...style,
        },
      }, children)
    }

    function Mono({ children, style }) {
      return h('span', { style: { fontFamily: T.mono, fontSize: 8.5, letterSpacing: '.04em', color: T.faint, ...style } }, children)
    }

    function SectionHead({ kicker, title, action, onAction }) {
      return h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 7, margin: '14px 0 6px' } },
        h(Mono, null, kicker),
        h('span', { style: { fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', color: T.ink } }, title),
        h('span', { style: { flex: 1, height: 1, background: T.line, transform: 'translateY(-2px)' } }),
        action ? h('button', {
          type: 'button', onClick: onAction,
          style: { appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', color: T.accent, fontSize: 9.5, padding: 0, fontFamily: T.sans },
        }, action) : null)
    }

    function Card({ children, marked, style }) {
      return h('div', {
        style: {
          position: 'relative', background: T.card, border: `1px solid ${T.line}`, borderRadius: 2,
          padding: '11px 12px', ...style,
        },
      }, marked ? h('span', { style: { position: 'absolute', left: -1, top: 10, bottom: 10, width: 2, background: T.mark } }) : null, children)
    }

    function Empty({ icon = 'spark', title, lines = [], action, onAction }) {
      return h('div', { style: { textAlign: 'center', padding: '34px 16px', color: T.muted } },
        h('div', {
          style: {
            width: 34, height: 34, margin: '0 auto 10px', borderRadius: 2, display: 'grid', placeItems: 'center',
            border: `1px solid ${T.line}`, color: T.accent, background: T.card,
          },
        }, h(Icon, { name: icon, size: 17 })),
        h('div', { style: { fontFamily: T.serif, fontSize: 13.5, color: T.ink } }, title),
        lines.length ? h('div', { style: { fontSize: 9.5, lineHeight: 1.7, marginTop: 6 } }, lines.map((line, index) => h('div', { key: index }, line))) : null,
        action ? h('div', { style: { marginTop: 12 } }, h(Btn, { primary: true, onClick: onAction, style: { padding: '7px 14px' } }, action)) : null)
    }

    function Sheet({ kicker, title, onClose, children, footer }) {
      return h('div', {
        style: {
          position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
          background: T.bg, color: T.ink,
        },
      },
        h('div', { style: { padding: '15px 16px 0' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h(Mono, null, kicker),
              h('div', { style: { fontFamily: T.serif, fontSize: 17, fontWeight: 600, letterSpacing: '.02em', marginTop: 3 } }, title)),
            h(IconBtn, { icon: 'close', onClick: onClose, title: '关闭' })),
          h('div', { style: { height: 1, background: T.line, marginTop: 11 } })),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 16px' } }, children),
        footer ? h('div', { style: { borderTop: `1px solid ${T.line}`, padding: '9px 16px 11px', background: T.bg } }, footer) : null)
    }

    function Toast({ text }) {
      if (!text) return null
      return h('div', {
        style: {
          position: 'absolute', left: 12, right: 12, bottom: 58, zIndex: 30,
          background: T.ink, color: T.bg, fontSize: 10, lineHeight: 1.5, padding: '6px 9px',
          borderRadius: 2, boxShadow: '0 6px 20px rgba(0,0,0,.18)',
        },
      }, text)
    }

    function WeightEditor({ profile, onSave, saving }) {
      const [draft, setDraft] = React.useState(null)
      const current = draft ?? profile?.blend?.global ?? {}
      const modes = profile?.modes ?? []
      const total = modes.reduce((sum, mode) => sum + (Number(current[mode.id]) || 0), 0) || 1
      const set = (id, value) => {
        const next = { ...current, [id]: Math.max(0, Number(value) || 0) }
        setDraft(next)
      }
      return h('div', null,
        modes.map((mode) => h('div', { key: mode.id, style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 } },
          h('span', { style: { width: 35, fontSize: 9.5, color: T.muted } }, mode.name),
          h('input', {
            type: 'range', min: 0, max: 100, step: 1, value: Math.round((Number(current[mode.id]) || 0) * 100),
            onChange: (event) => set(mode.id, Number(event.target.value) / 100),
            style: { flex: 1, accentColor: T.accent, height: 3 },
          }),
          h(Mono, { style: { width: 32, textAlign: 'right', color: T.muted } }, `${Math.round(((Number(current[mode.id]) || 0) / total) * 100)}%`))),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 7 } },
          h(Btn, { ghost: true, disabled: saving || !draft, onClick: () => onSave(current), style: { padding: '5px 9px', fontSize: 10 } }, saving ? '保存中…' : '保存权重')))
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 2. Tabs
     * ════════════════════════════════════════════════════════════════════════ */
    function ShelfTab({ snap, onImport, onRemove, onMeasure, busy, onEvidence }) {
      const works = snap?.works ?? []
      const capacity = snap?.capacity ?? {}
      const byWork = new Map((snap?.sources ?? []).map((source) => [source.workId, source]))
      if (!works.length) {
        return h(Empty, {
          icon: 'book', title: '书架还是空的',
          lines: ['先导入 2–3 部你认可的作品；如果有 3–5 万字自己的旧稿，也一起放进来。', '这一步决定它学的是“你喜欢的写法”，还是“你怎么写”。'],
          action: '导入作品', onAction: onImport,
        })
      }
      return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 13 } },
          h('div', { style: { fontSize: 11.5, fontWeight: 600 } }, `${works.length} 部作品`),
          h(Mono, null, `${fmtChars(capacity.chars)} · ${works.filter((work) => work.status === 'measured').length} 部已统计`),
          h('span', { style: { flex: 1 } }),
          h(Btn, { ghost: true, onClick: onImport, style: { padding: '4px 8px', fontSize: 10 } }, '＋ 导入')),
        h('div', { style: { marginTop: 8, height: 3, background: T.card2, position: 'relative', borderRadius: 2 } },
          h('span', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, ((capacity.chars ?? 0) / (capacity.charsLimit ?? 1)) * 100)}%`, background: T.accent } })),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4 } },
          h(Mono, null, `${(capacity.works ?? 0)} / ${capacity.worksLimit ?? 20} 部`),
          h(Mono, null, `${((capacity.chars ?? 0) / 10000).toFixed(1)} 万 / 2000 万字`)),
        h('div', { style: { marginTop: 10 } },
          works.map((work) => {
            const source = byWork.get(work.workId)
            const evidence = source?.evidenceCount ?? 0
            return h(Card, { key: work.workId, marked: work.sourceType === 'own', style: { marginBottom: 7 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
                h('div', { style: { fontSize: 10.8, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `《${work.title}》`),
                h(Tag, { tone: work.sourceType === 'own' ? 'mark' : 'line' }, roleName(work.sourceType)),
                h('span', { style: { flex: 1 } }),
                h(Mono, { style: { color: work.status === 'measured' ? T.ok : T.mark } }, work.status === 'measured' ? '已统计 ✓' : '待统计')),
              h('div', { style: { display: 'flex', gap: 9, marginTop: 5, flexWrap: 'wrap' } },
                h(Mono, null, fmtChars(work.chars)),
                h(Mono, null, `${work.chapters ?? 0} 章`),
                h(Mono, null, `证据 ${evidence} 条`)),
              h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
                h(Btn, { quiet: true, onClick: () => onMeasure([work.workId]), style: { fontSize: 9.5 } }, busy ? '统计中…' : '重新统计'),
                h(Btn, { quiet: true, onClick: () => onEvidence({ workId: work.workId }), style: { fontSize: 9.5, color: T.accent } }, '看证据'),
                h('span', { style: { flex: 1 } }),
                h(Btn, { quiet: true, onClick: () => onRemove(work.workId), style: { fontSize: 9.5, color: T.mark } }, '移除')))
          })),
        h('div', {
          style: { marginTop: 4, borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9, lineHeight: 1.65, color: T.muted },
        }, h('b', { style: { color: T.mark } }, '参考作品影响哪些层 '), 'L1 总则、L2 区间、L4 场景与锚点；L3 技法要“从作品提取”并逐条确认。我的旧稿额外提供 ≤400 字人名遮蔽样段。'))
    }

    function SourceMap({ sources, totalEvidence, onEvidence }) {
      if (!sources?.length) return null
      const max = Math.max(1, ...sources.map((source) => source.evidenceCount || 0))
      return h('div', null, sources.map((source) => h('div', {
        key: source.workId,
        style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 28px', gap: 7, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${T.line}` },
      },
        h('div', { style: { minWidth: 0 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.2, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            `《${source.title}》`, h(Tag, { tone: source.role === 'own' ? 'mark' : 'line' }, roleName(source.role)),
            h(Mono, null, `${source.chapters ?? 0} 章`))),
        h('div', { style: { height: 5, background: T.card2, position: 'relative', overflow: 'hidden' } },
          h('i', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(((source.evidenceCount || 0) / max) * 100)}%`, background: source.role === 'own' ? T.ok : T.accent, opacity: 0.8 } })),
        h(Mono, { style: { textAlign: 'right', color: T.muted } }, source.evidenceCount || 0))),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4 } },
        h(Mono, null, '条形按证据条数；不是权重'),
        h(Mono, null, `共 ${totalEvidence ?? 0} 条`)))
    }

    function ProfileTab({ snap, onBrief, briefBusy, onCreateProfile, onSaveWeights, saving, onExtract, extracting, onMirror, onEvidence, onHistory }) {
      const profile = snap?.profile
      if (!profile) {
        return h(Empty, {
          icon: 'sliders', title: '还没有风格档案',
          lines: ['档案由书架里的作品统计而来：统计全在本地，零模型。', snap?.works?.length ? '书架里已有作品，可以直接用模板建一份。' : '先在「书架」导入至少一部作品。'],
          action: snap?.works?.length ? '用模板建档案' : null, onAction: onCreateProfile,
        })
      }
      const rules = (profile.rules ?? []).filter((rule) => rule.status !== 'rejected')
      const confirmed = rules.filter((rule) => rule.status === 'confirmed')
      const pending = rules.filter((rule) => rule.status === 'candidate')
      const evidenceCount = profile.evidenceCount ?? rules.reduce((sum, rule) => sum + (rule.evidence ?? 0), 0)
      const totalEvidence = (snap?.sources ?? []).reduce((sum, source) => sum + (source.evidenceCount ?? 0), 0) || evidenceCount
      const global = profile.blend?.global ?? {}
      return h('div', null,
        h(Card, { marked: true, style: { marginTop: 13 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h(Mono, null, 'L1 · 风格身份'), h(Tag, { tone: 'ok' }, '已确认'), h('span', { style: { flex: 1 } }),
            h(Mono, null, `v${profile.version}`)),
          h('div', { style: { fontFamily: T.serif, fontSize: 15.5, lineHeight: 1.7, letterSpacing: '.02em', marginTop: 7 } }, profile.identity?.summary ?? '还没有总则。'),
          h('div', { style: { display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 6 } },
            h(Mono, null, `${confirmed.length} 条技法`), h(Mono, null, `${evidenceCount} 条证据`), h(Mono, null, `${profile.sources?.length ?? 0} 部来源`)),
          h('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 } },
            (profile.modes ?? []).map((mode) => h('span', {
              key: mode.id,
              style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.3, border: `1px solid ${T.line2}`, borderRadius: 2, padding: '2px 6px', color: T.muted },
            }, h('i', { style: { width: 4, height: 4, borderRadius: 99, background: MODE_COLOR[mode.id] ?? T.accent } }), mode.name,
              h(Mono, { style: { color: T.faint } }, `${Math.round((Number(global[mode.id]) || 0) * 100)}%`))))),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.line}`, borderRight: 0, marginTop: 10 } },
          [['技法', confirmed.length], ['证据', evidenceCount], ['来源', profile.sources?.length ?? 0], ['版本', `v${profile.version}`]].map(([label, value], index) => h('div', {
            key: label, style: { padding: '7px 8px', borderRight: `1px solid ${T.line}`, background: T.card },
          }, h('div', { style: { fontFamily: T.mono, fontSize: 14, color: T.ink } }, value), h(Mono, null, label)))),
        h('button', {
          type: 'button', onClick: onMirror,
          style: {
            width: '100%', marginTop: 10, textAlign: 'left', cursor: 'pointer', border: `1px solid ${T.accent}`,
            background: T.accent, color: T.accentInk, borderRadius: 2, padding: '10px 12px', position: 'relative', fontFamily: T.sans,
          },
        },
          h(Mono, { style: { color: T.accentInk, opacity: 0.75 } }, 'MIRROR · 主操作'),
          h('div', { style: { fontFamily: T.serif, fontSize: 15, marginTop: 3, letterSpacing: '.03em' } }, '对照一段'),
          h('div', { style: { fontSize: 9.3, opacity: 0.8, marginTop: 3, lineHeight: 1.5, paddingRight: 16 } }, '用一段真实文本检验这份档案：哪里命中、哪里偏离、为什么。不评分，只给位置与来源。'),
          h('span', { style: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: T.mono, opacity: 0.8 } }, '→')),
        h(SectionHead, { kicker: 'Provenance', title: '来源与证据', action: '全部', onAction: () => onEvidence({}) }),
        h(SourceMap, { sources: snap.sources, totalEvidence, onEvidence }),
        h(SectionHead, { kicker: 'Rules', title: '核心选择', action: '从作品提取', onAction: onExtract }),
        rules.slice(0, 6).map((rule) => h('div', {
          key: rule.id, onClick: () => onEvidence({ ruleId: rule.id }),
          style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: `1px solid ${T.line}`, cursor: 'pointer' },
        },
          h('i', { style: { width: 5, height: 5, borderRadius: 99, background: rule.status === 'confirmed' ? T.ok : T.mark, marginTop: 5, flex: '0 0 auto' } }),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 10.6, lineHeight: 1.5, color: T.ink } }, rule.title),
            h(Mono, null, `${(rule.scope ?? []).map((scene) => SCENE_LABEL[scene] ?? scene).join(' / ') || '通用'} · ${ruleStatusLabel(rule.status)}`)),
          h(Mono, { style: { color: T.accent, whiteSpace: 'nowrap' } }, `证据 ${rule.evidence ?? 0}`))),
        pending.length ? h('div', { style: { marginTop: 6, fontSize: 9, color: T.mark } }, `另有 ${pending.length} 条待确认，在「学习」里处理。`) : null,
        h(SectionHead, { kicker: 'Weights', title: '模式权重', action: null }),
        h(WeightEditor, { profile, onSave: onSaveWeights, saving }),
        h(SectionHead, { kicker: 'Timeline', title: '档案时间线', action: '查看', onAction: onHistory }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', fontSize: 9.5, color: T.muted } },
          h(Icon, { name: 'history', size: 13, style: { color: T.accent } }),
          h('span', null, `当前 v${profile.version} · revision ${snap.revision ?? profile.revision ?? '—'}`),
          h('span', { style: { flex: 1 } }),
          h(Btn, { quiet: true, onClick: onBrief, disabled: briefBusy, style: { color: T.accent, fontSize: 9.5 } }, briefBusy ? '编译中…' : '生成简报')),
        h('div', {
          style: { marginTop: 4, borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9, lineHeight: 1.65, color: T.muted },
        }, h('b', { style: { color: T.mark } }, '这一版不做什么 '), '没有文笔分、相似度、排行榜。档案的每一句都能回到原文；不能追溯的，标“未匹配”。'))
    }

    function LearnTab({ snap, onAccept, onReject, onSetRule, onHistory }) {
      const pending = snap?.pending ?? []
      const history = snap?.history ?? []
      return h('div', null,
        h('div', {
          style: { marginTop: 13, borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9, lineHeight: 1.65, color: T.muted },
        }, h('b', { style: { color: T.mark } }, '只记录，不自动升级 '), '同一条意见出现两次才进候选；你确认后才写进档案，且可回滚。'),
        h(SectionHead, { kicker: 'Candidates', title: '待确认', action: String(pending.length), onAction: null }),
        pending.length ? pending.map((candidate) => h(Card, { key: candidate.id, marked: true, style: { marginBottom: 7 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h(Mono, null, candidate.kind === 'like' ? 'L3 · 正向' : 'L3 · 改稿'),
            h(Tag, { tone: 'line' }, `支持 ${candidate.supports ?? 1} · 反例 0`)),
          h('div', { style: { fontSize: 10.6, lineHeight: 1.65, color: T.ink, marginTop: 6 } }, candidate.text),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
            h(Btn, { primary: true, onClick: () => onAccept(candidate), style: { flex: 1, padding: '5px 8px', fontSize: 10 } }, '确认，写进档案'),
            h(Btn, { ghost: true, onClick: () => onReject(candidate), style: { padding: '5px 8px', fontSize: 10 } }, '忽略'))))
          : h('div', { style: { fontSize: 9.5, color: T.faint, padding: '6px 0 2px' } }, '没有待确认候选。在对话里用 voice_feedback 记录同一条意见两次，或从作品提取技法。'),
        h(SectionHead, { kicker: 'Versions', title: '版本记录', action: '查看', onAction: onHistory }),
        history.slice(0, 4).map((item) => h('div', { key: `${item.version}-${item.revision ?? 'x'}`, style: { display: 'flex', gap: 8, padding: '7px 0', borderBottom: `1px solid ${T.line}` } },
          h('i', { style: { width: 5, height: 5, borderRadius: 99, background: item.current ? T.ok : T.faint, marginTop: 5 } }),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 10.4, color: T.ink } }, `v${item.version} · ${ACTION_LABEL[item.action] ?? item.action ?? '写档案'}`),
            h(Mono, null, `${fmtTime(item.at)}${item.restoredFrom ? ` · 恢复自 v${item.restoredFrom}` : ''}`)),
          h(Mono, { style: { color: item.current ? T.ok : T.faint } }, item.current ? '当前' : ''))),
        h(SectionHead, { kicker: 'Recent', title: '最近', action: null }),
        (snap?.feedback ?? []).slice(0, 4).map((event) => h('div', { key: event.id, style: { display: 'flex', gap: 7, padding: '6px 0', borderBottom: `1px solid ${T.line}`, fontSize: 9.5, color: T.muted } },
          h(Icon, { name: 'clock', size: 12, style: { color: T.faint, marginTop: 1 } }),
          h('span', { style: { flex: 1 } }, event.text || event.kind),
          h(Mono, null, fmtTime(event.at)))),
        !pending.length && !(snap?.feedback ?? []).length ? h('div', { style: { fontSize: 9.5, color: T.faint, padding: '6px 0' } }, '还没有反馈记录。') : null)
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 3. Sheets
     * ════════════════════════════════════════════════════════════════════════ */
    function EvidenceSheet({ snap, filter, onClose, remote, sessionId, onToast }) {
      const [checks, setChecks] = React.useState({})
      const [checking, setChecking] = React.useState(null)
      const profile = snap?.profile
      const rules = profile?.rules ?? []
      const selected = filter?.ruleId ? rules.find((rule) => rule.id === filter.ruleId) : null
      const workId = filter?.workId ?? null
      const work = (snap?.sources ?? []).find((source) => source.workId === workId)
      const list = selected ? [selected] : rules.filter((rule) => !workId || (rule.evidenceItems ?? []).some((item) => item.workId === workId))
      const verify = async (key, item) => {
        setChecking(key)
        try {
          const result = await remote.verifyEvidence(sessionId, { workId: item.workId, chapter: item.chapter, quote: item.quote, hash: item.hash }).then(unwrap)
          setChecks((previous) => ({ ...previous, [key]: result }))
        } catch (error) {
          onToast(String(error?.message ?? error))
        } finally {
          setChecking(null)
        }
      }
      return h(Sheet, {
        kicker: work ? 'Evidence · 来源地图' : 'Evidence · 来源与证据',
        title: selected ? selected.title : work ? `《${work.title}》` : '来源与证据',
        onClose,
        footer: h(Btn, { ghost: true, onClick: onClose, style: { width: '100%' } }, '回到档案'),
      },
        h('div', { style: { fontSize: 9.3, lineHeight: 1.7, color: T.muted, marginBottom: 10 } },
          '每一句都能回到原文；回查失败的标 stale，找不到来源的标“未匹配”。面板只读，不改档案。'),
        list.length ? list.map((rule) => h('div', { key: rule.id, style: { marginBottom: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h(Tag, { tone: rule.status === 'confirmed' ? 'ok' : 'mark' }, ruleStatusLabel(rule.status)),
            h('div', { style: { fontSize: 10.8, fontWeight: 600 } }, rule.title),
            h('span', { style: { flex: 1 } }),
            h(Mono, null, `${(rule.evidenceItems ?? []).length} 条`)),
          (rule.evidenceItems ?? []).filter((item) => !workId || item.workId === workId).map((item, index) => {
            const source = (snap?.sources ?? []).find((entry) => entry.workId === item.workId)
            return h(Card, { key: `${rule.id}-${index}`, style: { marginTop: 6, padding: '9px 10px' } },
              h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 } },
                h(Mono, null, source ? `《${source.title}》` : '未匹配'),
                h(Mono, null, item.chapter ? `第 ${item.chapter} 章` : '章节未知'),
                h('span', { style: { flex: 1 } }),
                h(Mono, { style: { color: item.hash ? T.faint : T.mark } }, item.hash ? `hash ${String(item.hash).slice(0, 10)}` : '无 hash')),
              h('div', { style: { fontFamily: T.serif, fontSize: 11.3, lineHeight: 1.8, color: T.ink } }, `「${item.quote}」`),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 } },
                h('div', { style: { flex: 1, fontSize: 9, color: T.muted, lineHeight: 1.6 } },
                  item.workId
                    ? (checks[`${rule.id}-${index}`]
                      ? (checks[`${rule.id}-${index}`].found ? '已回查：原文命中' : `未找到原文${checks[`${rule.id}-${index}`].hashMatch === false ? '，hash 不一致' : '，标 stale'}`)
                      : '来自当前书架；可回查原文')
                    : '旧证据没有 workId：无法定位，标未匹配，不补猜。'),
                item.workId ? h(Btn, {
                  quiet: true, disabled: checking === `${rule.id}-${index}`,
                  onClick: () => verify(`${rule.id}-${index}`, item),
                  style: { fontSize: 9, color: checks[`${rule.id}-${index}`]?.found ? T.ok : T.accent },
                }, checking === `${rule.id}-${index}` ? '回查中…' : '回查') : null))
          }))) : h(Empty, { icon: 'link', title: '还没有可回查的证据', lines: ['先从作品提取技法，或在规则上补证据；没有原文的规则不能显示“已确认”。'] }))
    }

    function TimelineSheet({ snap, onClose }) {
      const history = snap?.history ?? []
      return h(Sheet, {
        kicker: 'Timeline · 档案时间线', title: '档案为什么变成现在这样', onClose,
        footer: h('div', { style: { fontSize: 9, color: T.faint, textAlign: 'center' } }, '0.2.0 只展示记录；回滚在对话：voice_profile rollback'),
      },
        history.length ? history.map((item) => h('div', { key: `${item.version}-${item.revision ?? 'x'}`, style: { padding: '8px 0', borderBottom: `1px solid ${T.line}` } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('span', { style: { fontFamily: T.mono, fontSize: 10, color: item.current ? T.ok : T.ink } }, `v${item.version}`),
            h(Tag, { tone: item.current ? 'ok' : 'line' }, item.current ? '当前' : (ACTION_LABEL[item.action] ?? item.action ?? '写档案')),
            h('span', { style: { flex: 1 } }),
            h(Mono, null, `rev ${item.revision ?? '未知'}`)),
          h(Mono, { style: { display: 'block', marginTop: 2 } }, `${fmtTime(item.at)}${item.restoredFrom ? ` · 恢复自 v${item.restoredFrom}` : ''}`),
          (item.changes ?? []).map((change, index) => h('div', { key: index, style: { fontSize: 9.3, color: T.muted, marginTop: 3 } }, `· ${change.text}`)),
          !(item.changes ?? []).length && !item.current ? h('div', { style: { fontSize: 9, color: T.faint, marginTop: 3 } }, '（没有可比较的变更）') : null))
          : h(Empty, { icon: 'history', title: '还没有版本记录', lines: ['确认档案、改权重、加技法都会留下快照。'] }))
    }

    function MirrorBand({ row }) {
      const value = Number(row.value)
      const band = row.band
      if (!Array.isArray(band)) {
        return h('div', { style: { marginTop: 8, fontSize: 9.5, color: T.faint } }, `${row.label}：档案里没有区间`)
      }
      const lo = Math.min(band[0], value)
      const hi = Math.max(band[1], value)
      const span = Math.max(0.0001, hi - lo)
      const left = ((band[0] - lo) / span) * 100
      const width = ((band[1] - band[0]) / span) * 100
      const mark = ((value - lo) / span) * 100
      const outside = row.direction === 'low' || row.direction === 'high'
      return h('div', { style: { marginTop: 9 } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
          h('span', { style: { fontSize: 10, color: T.ink } }, row.label),
          h(Mono, { style: { marginLeft: 'auto', color: outside ? T.mark : T.muted } },
            `${value} · 区间 ${band[0]}–${band[1]}${outside ? (row.direction === 'low' ? ' · 偏短' : ' · 偏长') : ' · 区间内'}`)),
        h('div', { style: { height: 12, position: 'relative', marginTop: 4, borderBottom: `1px solid ${T.line}` } },
          h('span', { style: { position: 'absolute', left: `${left}%`, width: `${width}%`, top: 4, height: 5, background: T.accentSoft, borderLeft: `1px solid ${T.accent}`, borderRight: `1px solid ${T.accent}` } }),
          h('span', { style: { position: 'absolute', left: `${mark}%`, top: 0, width: 2, height: 10, background: T.mark } })))
    }

    function MirrorSheet({ remote, sessionId, snap, onClose, onToast }) {
      const [text, setText] = React.useState('')
      const [scene, setScene] = React.useState('悬疑对峙')
      const [result, setResult] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const works = snap?.works ?? []
      const [workId, setWorkId] = React.useState(works[0]?.workId ?? '')
      const [chapter, setChapter] = React.useState(1)
      const [loadingChapter, setLoadingChapter] = React.useState(false)
      const loadChapter = async () => {
        if (!workId) { onToast('书架里还没有作品。'); return }
        setLoadingChapter(true)
        try {
          const loaded = await remote.chapterText(sessionId, { workId, chapter }).then(unwrap)
          setText(loaded?.text ?? '')
          onToast(`已载入《${loaded?.title ?? workId}》第 ${chapter} 章`)
        } catch (error) {
          onToast(String(error?.message ?? error))
        } finally {
          setLoadingChapter(false)
        }
      }
      const run = async () => {
        if (!text.trim()) { onToast('先粘贴一段或选一章。'); return }
        setBusy(true)
        try {
          const payload = { text, scene }
          if (result) {
            payload.textHash = result.textHash
            payload.profileRevision = result.profileRevision
          }
          const next = await remote.mirror(sessionId, payload).then(unwrap)
          setResult(next)
        } catch (error) {
          onToast(String(error?.message ?? error))
        } finally {
          setBusy(false)
        }
      }
      const rules = new Map((snap?.profile?.rules ?? []).map((rule) => [rule.id, rule]))
      return h(Sheet, {
        kicker: 'Mirror · 对照镜', title: '对照一段', onClose,
        footer: h('div', { style: { fontSize: 9, color: T.faint, textAlign: 'center' } }, '无总分 · 无百分比 · 无合格线 · 只在对话里改稿'),
      },
        h('div', { style: { fontSize: 9, color: T.faint, fontFamily: T.mono, letterSpacing: '.08em', marginBottom: 4 } }, '场景'),
        h('div', { style: { display: 'flex', border: `1px solid ${T.line}`, borderRadius: 2, overflow: 'hidden', marginBottom: 10 } },
          SCENE_ORDER.slice(0, 4).map((item) => h('button', {
            key: item, type: 'button', className: 'dsh-seg', onClick: () => setScene(item),
            style: {
              appearance: 'none', borderTop: 'none', borderLeft: 'none', flex: 1, padding: '5px 3px', cursor: 'pointer', fontFamily: T.sans, fontSize: 9.5,
              background: scene === item ? T.accentSoft : T.card, color: scene === item ? T.accent : T.muted,
              borderRight: `1px solid ${T.line}`,
            },
          }, SCENE_LABEL[item] ?? item))),
        works.length ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 } },
          h('select', {
            value: workId, onChange: (event) => setWorkId(event.target.value),
            style: { flex: 1, minWidth: 0, border: `1px solid ${T.line}`, background: T.card, color: T.ink, fontFamily: T.sans, fontSize: 9.5, padding: '5px 6px', borderRadius: 2 },
          }, works.map((work) => h('option', { key: work.workId, value: work.workId }, `《${work.title}》`))),
          h('input', {
            type: 'number', min: 1, value: chapter, onChange: (event) => setChapter(Math.max(1, Number(event.target.value) || 1)),
            style: { width: 54, border: `1px solid ${T.line}`, background: T.card, color: T.ink, fontFamily: T.mono, fontSize: 9.5, padding: '5px 6px', borderRadius: 2 },
          }),
          h(Btn, { ghost: true, onClick: loadChapter, disabled: loadingChapter, style: { padding: '5px 8px', fontSize: 9.5 } }, loadingChapter ? '载入中…' : '选这一章')) : null,
        h('textarea', {
          value: text, onChange: (event) => setText(event.target.value),
          placeholder: '粘贴一段待检文本……',
          style: {
            width: '100%', minHeight: 90, resize: 'vertical', border: `1px solid ${T.line}`, background: T.card,
            color: T.ink, fontFamily: T.serif, fontSize: 11.5, lineHeight: 1.8, padding: '8px 9px', borderRadius: 2,
          },
        }),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
          h(Btn, { primary: true, onClick: run, disabled: busy, style: { flex: 1 } }, busy ? '对照中…' : '开始对照'),
          h(Btn, { ghost: true, onClick: () => setText('') }, '清空')),
        result ? h('div', { style: { marginTop: 14 } },
          result.stale ? h('div', { style: { borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9.5, color: T.mark, marginBottom: 8 } }, result.staleReason) : null,
          h(SectionHead, { kicker: 'Result', title: '对照结果', action: `rev ${result.profileRevision}`, onAction: null }),
          h('div', { style: { borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9.2, lineHeight: 1.65, color: T.muted, marginBottom: 2 } },
            h('b', { style: { color: T.mark } }, '没有总分 '), '下面是“和档案的区间相比”，不是好坏。偏离不等于错，可能只是这一章需要另一种写法。'),
          (result.bands ?? []).map((row) => h(MirrorBand, { key: row.metric, row })),
          h(SectionHead, { kicker: 'Findings', title: '命中与偏离', action: `${(result.findings ?? []).length} 处`, onAction: null }),
          (result.findings ?? []).slice(0, 8).map((finding) => {
            const rule = finding.ruleId ? rules.get(finding.ruleId) : null
            return h(Card, { key: finding.id, style: { marginTop: 7, padding: '8px 10px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
                h(Tag, { tone: rule ? 'mark' : 'muted' }, rule ? '命中' : '未匹配'),
                h('span', { style: { fontSize: 9.2, color: T.muted } }, DETECTOR_LABEL[finding.detector] ?? finding.detector),
                h('span', { style: { flex: 1 } }),
                h(Mono, null, `第 ${(finding.span?.start ?? 0) + 1} 字`)),
              h('div', { style: { fontFamily: T.serif, fontSize: 11.3, lineHeight: 1.8, color: T.ink, marginTop: 4 } }, `「${finding.quote}」`),
              h('div', { style: { fontSize: 9, color: T.muted, marginTop: 3, lineHeight: 1.6 } }, finding.why),
              h('div', { style: { fontSize: 9, color: rule ? T.accent : T.faint, marginTop: 3 } }, rule ? `对应规则：${rule.title} · 证据 ${rule.evidence ?? 0} 条` : '找不到可追溯的来源：标“未匹配”，不把它算作命中。'))
          }),
          !(result.findings ?? []).length ? h('div', { style: { fontSize: 9.5, color: T.ok, padding: '8px 0' } }, '四类命中都没有出现；区间偏离仍以对照条为准。') : null,
          h('div', { style: { borderLeft: `2px solid ${T.accent}`, background: T.card2, padding: '6px 9px', fontSize: 9.2, lineHeight: 1.65, color: T.muted, marginTop: 10 } },
            h('b', { style: { color: T.accent } }, '下一步 '), '把命中的句子交给 voice_polish fix:true 做定点改写；默认只报不改，改坏会回退。')) : null)
    }

    function BriefSheet({ remote, sessionId, onClose, onToast }) {
      const [scene, setScene] = React.useState('悬疑对峙')
      const [brief, setBrief] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const load = async (nextScene = scene) => {
        setBusy(true)
        try {
          setBrief(await remote.brief(sessionId, { scene: nextScene }).then(unwrap))
        } catch (error) {
          onToast(String(error?.message ?? error))
        } finally {
          setBusy(false)
        }
      }
      React.useEffect(() => { load(scene) }, [])
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(brief?.markdown ?? '')
          onToast('简报已复制')
        } catch { onToast('复制失败；请手动选中正文复制') }
      }
      return h(Sheet, {
        kicker: 'Brief · 写前简报', title: '文风简报', onClose,
        footer: h('div', { style: { display: 'flex', gap: 6 } },
          h(Btn, { primary: true, onClick: copy, disabled: !brief?.ok, style: { flex: 1 } }, '复制简报'),
          h(Btn, { ghost: true, onClick: () => load(scene), disabled: busy }, busy ? '编译中…' : '重新编译')),
      },
        h('div', { style: { display: 'flex', border: `1px solid ${T.line}`, borderRadius: 2, overflow: 'hidden', marginBottom: 10 } },
          ['日常过渡', '动作战斗', '悬疑对峙', '心理情感'].map((item) => h('button', {
            key: item, type: 'button', className: 'dsh-seg', onClick: () => { setScene(item); load(item) },
            style: { appearance: 'none', borderTop: 'none', borderLeft: 'none', flex: 1, padding: '5px 3px', cursor: 'pointer', fontFamily: T.sans, fontSize: 9.5, background: scene === item ? T.accentSoft : T.card, color: scene === item ? T.accent : T.muted, borderRight: `1px solid ${T.line}` },
          }, SCENE_LABEL[item] ?? item))),
        brief?.ok ? h('div', null,
          h(Card, { marked: true },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h(Mono, null, `BRIEF · ${brief.scene ?? scene}`),
              h('span', { style: { flex: 1 } }),
              h(Mono, null, `${brief.chars ?? 0} / 600 字`)),
            h('pre', { style: { margin: '8px 0 0', whiteSpace: 'pre-wrap', fontFamily: T.serif, fontSize: 11.3, lineHeight: 1.9, color: T.ink } }, brief.markdown ?? '')),
          h('div', { style: { marginTop: 6, fontSize: 9, color: T.muted } }, `来自 ${brief.rules?.length ?? 0} 条规则 · 锚点 ${brief.anchors ?? 0} · 样段 ${brief.sample ?? 0} 字 · v${brief.sources?.profileVersion ?? '—'}`))
          : h(Empty, { icon: 'spark', title: brief?.message ?? '还没有可编译的简报', lines: ['先建立并确认档案，再回来生成。'] }))
    }

    function ImportSheet({ onClose, onFolder, onFiles, onPath, busy }) {
      const [sourceType, setSourceType] = React.useState('reference')
      const [pathValue, setPathValue] = React.useState('')
      const fileRef = React.useRef(null)
      return h(Sheet, {
        kicker: 'Import · 建立书架', title: '导入作品', onClose,
        footer: h('div', { style: { fontSize: 9, color: T.faint, textAlign: 'center' } }, '导入与统计 0 模型 · 只有“从作品提取技法”会调用模型'),
      },
        h('div', { style: { fontSize: 9, color: T.faint, fontFamily: T.mono, letterSpacing: '.08em', marginBottom: 4 } }, '这些文本是什么'),
        h('div', { style: { display: 'flex', border: `1px solid ${T.line}`, borderRadius: 2, overflow: 'hidden', marginBottom: 10 } },
          [['reference', '参考作品'], ['own', '我的旧稿']].map(([value, label]) => h('button', {
            key: value, type: 'button', className: 'dsh-seg', onClick: () => setSourceType(value),
            style: { appearance: 'none', borderTop: 'none', borderLeft: 'none', flex: 1, padding: '6px 4px', cursor: 'pointer', fontFamily: T.sans, fontSize: 10, background: sourceType === value ? T.accentSoft : T.card, color: sourceType === value ? T.accent : T.muted, borderRight: `1px solid ${T.line}` },
          }, label))),
        h('div', { style: { border: `1px dashed ${T.line2}`, background: T.card, borderRadius: 2, padding: '16px 12px', textAlign: 'center' } },
          h('div', { style: { fontFamily: T.serif, fontSize: 13 } }, '把 TXT / MD 拖进来'),
          h('div', { style: { fontSize: 9, color: T.faint, marginTop: 4, lineHeight: 1.6 } }, '整本、多文件、文件夹都可以 · 单文件 ≤ 6 MB，一次 ≤ 20 MB'),
          h('div', { style: { display: 'flex', justifyContent: 'center', gap: 12, marginTop: 9, fontSize: 9.5 } },
            h('button', { type: 'button', onClick: () => onFolder(sourceType), style: linkBtn }, '选文件夹'),
            h('button', { type: 'button', onClick: () => fileRef.current?.click(), style: linkBtn }, '选文件'),
            h('input', { ref: fileRef, type: 'file', accept: '.txt,.md,.markdown,text/plain', multiple: true, style: { display: 'none' }, onChange: (event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onFiles(files, sourceType) } }),
            h('button', { type: 'button', onClick: () => onPath(pathValue, sourceType), style: linkBtn }, '输入路径'))),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
          h('input', {
            value: pathValue, onChange: (event) => setPathValue(event.target.value), placeholder: 'D:\\小说\\参考作品.txt',
            style: { flex: 1, border: `1px solid ${T.line}`, background: T.card, color: T.ink, fontFamily: T.mono, fontSize: 9.5, padding: '6px 8px', borderRadius: 2 },
          }),
          h(Btn, { ghost: true, onClick: () => onPath(pathValue, sourceType), disabled: busy }, '导入')),
        h('div', { style: { marginTop: 10, borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9.2, lineHeight: 1.65, color: T.muted } },
          h('b', { style: { color: T.mark } }, '第一次导入 '), '建议 2–3 部你认可的作品，再加 3–5 万字自己的旧稿；样本太少时，档案会明确标“低置信”。'))
    }

    const linkBtn = { appearance: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'transparent', color: T.accent, cursor: 'pointer', fontSize: 9.5, padding: 0, fontFamily: T.sans, borderBottom: `1px solid ${T.accentSoft}` }

    /* ════════════════════════════════════════════════════════════════════════
     * 4. Panel
     * ════════════════════════════════════════════════════════════════════════ */
    function VoicePanel({ sessionId, remote }) {
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [mode, setMode] = React.useState(false)
      const [snap, setSnap] = React.useState(null)
      const [tab, setTab] = React.useState('shelf')
      const [sheet, setSheet] = React.useState(null)
      const [toast, setToast] = React.useState(null)
      const [busy, setBusy] = React.useState(null)

      const load = React.useCallback(async () => {
        if (!remote || !sessionId) { setPhase('error'); setError('面板服务还没挂载'); return }
        try {
          const [modeResult, panelResult] = await Promise.all([
            remote.status(sessionId).then(unwrap),
            remote.panel(sessionId, {}).then(unwrap),
          ])
          setMode(Boolean(modeResult?.on))
          setSnap(panelResult)
          setPhase('ready')
          setError(null)
        } catch (cause) {
          setPhase('error')
          setError(String(cause?.message ?? cause))
        }
      }, [remote, sessionId])

      React.useEffect(() => { load() }, [load])
      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 3600)
        return () => clearTimeout(timer)
      }, [toast])

      const run = async (key, task, success) => {
        setBusy(key)
        try {
          await task()
          if (success) setToast(success)
          await load()
        } catch (cause) {
          setToast(String(cause?.message ?? cause))
        } finally {
          setBusy(null)
        }
      }

      const toggleMode = () => run('mode', async () => {
        const result = await remote.setMode(sessionId, !mode).then(unwrap)
        setMode(Boolean(result?.on))
      }, mode ? '创作风格已关' : '创作风格已开')

      const makeBrief = () => setSheet({ kind: 'brief' })
      const openMirror = () => setSheet({ kind: 'mirror' })
      const openEvidence = (filter) => setSheet({ kind: 'evidence', filter: filter ?? {} })
      const openHistory = () => setSheet({ kind: 'timeline' })
      const openImport = () => setSheet({ kind: 'import' })

      const importFolder = (sourceType) => run('import-folder', async () => {
        const result = await remote.importFolder(sessionId, { sourceType }).then(unwrap)
        if (result?.cancelled) { setToast('已取消'); return }
        const imported = result?.imported?.length ?? 0
        if (imported) { await remote.measureWorks(sessionId, {}).then(unwrap); setToast(`导入 ${imported} 部 · 已统计`); setSheet(null) }
        else setToast((result?.skipped?.length ?? 0) ? '这个文件夹里的作品已在书架里' : '没有找到 TXT / MD')
      }, null)

      const importFiles = (files, sourceType) => run('import-files', async () => {
        const list = []
        let total = 0
        for (const file of files.slice(0, 20)) {
          if (file.size > 6_000_000) throw new Error(`${file.name} 超过 6 MB；大文件请用「选文件夹」导入。`)
          total += file.size
          if (total > 20_000_000) throw new Error('一次最多约 20 MB；请分批。')
          const buffer = await file.arrayBuffer()
          list.push({ name: file.name, base64: bytesToBase64(new Uint8Array(buffer)) })
        }
        if (!list.length) throw new Error('没有选择文件')
        const result = await remote.importTexts(sessionId, { files: list, sourceType }).then(unwrap)
        const imported = result?.imported?.length ?? 0
        if (imported) { await remote.measureWorks(sessionId, {}).then(unwrap); setToast(`导入 ${imported} 部 · 已统计`); setSheet(null) }
        else setToast(result?.skipped?.[0]?.message || '没有可导入的文件')
      }, null)

      const importPath = (value, sourceType) => run('import-path', async () => {
        if (!String(value ?? '').trim()) throw new Error('先填一个路径')
        const result = await remote.importPath(sessionId, { path: value, sourceType }).then(unwrap)
        const imported = result?.imported?.length ?? 0
        if (imported) { await remote.measureWorks(sessionId, {}).then(unwrap); setToast(`导入 ${imported} 部 · 已统计`); setSheet(null) }
        else setToast('没有可导入的文件')
      })

      const measureWorks = (workIds) => run('measure', async () => {
        const result = await remote.measureWorks(sessionId, { workIds }).then(unwrap)
        setToast(`统计完成 ${(result?.measured ?? []).filter((item) => item.ok).length} 部`)
      }, null)

      const removeWork = (workId) => run('remove', async () => {
        const result = await remote.removeWork(sessionId, { workId }).then(unwrap)
        setToast(`已移除《${result?.title ?? workId}》`)
      }, null)

      const createProfile = () => run('create', async () => {
        const result = await remote.createProfile(sessionId, {}).then(unwrap)
        setToast(`档案 v${result?.profile?.version ?? '1.1'} 已建立`)
        setTab('style')
      }, null)

      const saveWeights = (blend) => run('weights', async () => {
        await remote.saveWeights(sessionId, { blend: { global: blend } }).then(unwrap)
      }, '权重已保存，下一次简报生效')

      const extractTechniques = () => run('extract', async () => {
        const result = await remote.extractTechniques(sessionId, { mode: 'quick' }).then(unwrap)
        if (result?.added) { setToast(`提取 ${result.added} 张候选技法，去「学习」确认`); setTab('learn') }
        else setToast(result?.accepted === 0 ? '没有提取到可用技法（引文没通过校验）' : '没有新增技法')
      }, null)

      const accept = (candidate) => run('accept', async () => {
        await remote.acceptCandidate(sessionId, { candidateId: candidate.id }).then(unwrap)
      }, '已写进档案')

      const reject = (candidate) => run('reject', async () => {
        await remote.rejectCandidate(sessionId, { candidateId: candidate.id }).then(unwrap)
      }, '已忽略')

      const tabs = [
        ['shelf', '书架', 'book', snap?.works?.length ?? 0],
        ['style', '档案', 'sliders', snap?.profile?.rules?.filter((rule) => rule.status === 'confirmed').length ?? 0],
        ['learn', '学习', 'spark', snap?.pending?.length ?? 0],
      ]

      const body = phase === 'loading'
        ? h('div', { style: { padding: 18, fontFamily: T.mono, fontSize: 9.5, color: T.muted } }, '读取中…')
        : phase === 'error'
          ? h(Empty, { icon: 'alert', title: '面板读取失败', lines: [error || '未知错误', '点右上角刷新重试。'] })
          : tab === 'shelf'
            ? h(ShelfTab, { snap, onImport: openImport, onRemove: removeWork, onMeasure: measureWorks, busy: busy === 'measure', onEvidence: openEvidence })
            : tab === 'style'
              ? h(ProfileTab, {
                snap, onBrief: makeBrief, briefBusy: busy === 'brief' || busy === 'create',
                onCreateProfile: createProfile, onSaveWeights: saveWeights, saving: busy === 'weights',
                onExtract: extractTechniques, extracting: busy === 'extract',
                onMirror: openMirror, onEvidence: openEvidence, onHistory: openHistory,
              })
              : h(LearnTab, { snap, onAccept: accept, onReject: reject, onHistory: openHistory })

      return h('div', {
        className: 'dsh-voice-panel',
        style: {
          position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
          background: T.bg, color: T.ink, fontFamily: T.sans, fontSize: 12, overflow: 'hidden',
        },
      },
        h('style', null, PANEL_CSS),
        h('div', { style: { padding: '15px 16px 0' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
            h(Mono, { style: { letterSpacing: '.18em', color: T.faint } }, 'COMPOSING ROOM · 排字房'),
            h('span', { style: { flex: 1, height: 1, background: T.line } })),
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontFamily: T.serif, fontSize: 20, lineHeight: 1.15, letterSpacing: '.02em', fontWeight: 600 } }, '风格工作室'),
              h('div', { style: { fontSize: 9.8, color: T.muted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                `《${snap?.book ?? '—'}》 · ${snap?.works?.length ?? 0} 部作品 · 档案 v${snap?.profile?.version ?? '—'}`)),
            h('button', {
              type: 'button', onClick: toggleMode, title: '切换 /voice on | off',
              style: {
                appearance: 'none', cursor: 'pointer', border: `1px solid ${mode ? T.ok : T.line}`, background: mode ? T.card2 : 'transparent',
                color: mode ? T.ok : T.muted, borderRadius: 999, padding: '3px 8px', fontFamily: T.mono, fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4,
              },
            }, h('i', { style: { width: 5, height: 5, borderRadius: 99, background: mode ? T.ok : T.faint } }), mode ? '开' : '关'),
            h(IconBtn, { icon: 'refresh', onClick: load, title: '重新读取' })),
          h('div', { style: { display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}`, marginTop: 12 } },
            tabs.map(([id, label, icon, count]) => h('button', {
              key: id, type: 'button', className: 'dsh-tab', onClick: () => setTab(id),
              style: {
                appearance: 'none', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 11,
                color: tab === id ? T.ink : T.muted, padding: '0 0 8px', marginRight: 20, position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5,
                borderBottom: `2px solid ${tab === id ? T.accent : 'transparent'}`, marginBottom: -1,
              },
            }, h(Icon, { name: icon, size: 13, style: { opacity: tab === id ? 1 : 0.6 } }), label,
              count ? h(Mono, { style: { color: tab === id ? T.accent : T.faint } }, count) : null)))),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '0 16px 12px' } },
          mode ? null : h('div', {
            style: { marginTop: 10, borderLeft: `2px solid ${T.mark}`, background: T.card2, padding: '6px 9px', fontSize: 9.3, lineHeight: 1.6, color: T.mark },
          }, '创作风格现在是关的：voice_* 工具在会话里不可见。点右上角「关」开启。'),
          body),
        h('div', { style: { borderTop: `1px solid ${T.line}`, padding: '9px 16px 11px', background: T.bg } },
          h('div', { style: { display: 'flex', gap: 6 } },
            h(Btn, { primary: true, onClick: makeBrief, disabled: !snap?.profile, style: { flex: 1 } }, h(Icon, { name: 'spark', size: 13 }), '生成文风简报'),
            h(Btn, { ghost: true, onClick: openMirror }, '对照一段')),
          h('div', { style: { marginTop: 6, fontSize: 8.6, fontFamily: T.mono, color: T.faint, textAlign: 'center', letterSpacing: '.03em' } }, '写前 600 字 · 写后定位 · 只改命中那一句')),
        sheet ? (sheet.kind === 'brief' ? h(BriefSheet, { remote, sessionId, onClose: () => setSheet(null), onToast: setToast })
          : sheet.kind === 'mirror' ? h(MirrorSheet, { remote, sessionId, snap, onClose: () => setSheet(null), onToast: setToast })
            : sheet.kind === 'evidence' ? h(EvidenceSheet, { snap, filter: sheet.filter, onClose: () => setSheet(null), remote, sessionId, onToast: setToast })
              : sheet.kind === 'timeline' ? h(TimelineSheet, { snap, onClose: () => setSheet(null) })
                : h(ImportSheet, { onClose: () => setSheet(null), onFolder: importFolder, onFiles: importFiles, onPath: importPath, busy: Boolean(busy) })) : null,
        h(Toast, { text: toast }))
    }

    function VoiceOpenButton({ open }) {
      return h('button', {
        type: 'button', onClick: open,
        style: {
          appearance: 'none', border: `1px solid ${T.line}`, background: 'transparent', color: T.muted,
          borderRadius: 2, padding: '3px 8px', fontSize: 11, lineHeight: '18px', cursor: 'pointer',
          fontFamily: T.sans, marginRight: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
        },
      }, h(Icon, { name: 'pen', size: 13 }), '创作风格')
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 4. Plugin
     * ════════════════════════════════════════════════════════════════════════ */
    const TAB_ID = 'dsh-novel-voice'
    const TAB_KIND = 'novel-voice'
    const TAB_TITLE = '创作风格'

    return {
      inject: ['slots', 'remote'],
      async apply(ctx) {
        let remote = null
        try {
          const dispose = await ctx.remote.$mount(TYPERT_REMOTE)
          remote = ctx.get('remote.voiceStudio') ?? null
          if (typeof dispose === 'function') {
            ctx.effect(() => () => {
              try { dispose() } catch { /* already gone */ }
            })
          }
          if (!remote) console.error('[novel-voice] remote.voiceStudio 未注册')
        } catch (error) {
          console.error('[novel-voice] remote mount 失败', error)
        }

        const seat = ctx.inject(['sidebarRightTabs', 'sidebarRight'], (scoped) => {
          const tabs = scoped.get('sidebarRightTabs')
          const right = scoped.get('sidebarRight')
          if (!tabs || !right) {
            console.warn('[novel-voice] 宿主右栏服务缺失，不注册页签。')
            return
          }

          scoped.effect(() => tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => TAB_TITLE,
            guide: [{
              id: TAB_ID,
              order: 12,
              title: () => TAB_TITLE,
              description: () => '导入作品、编译文风简报、看档案与待确认',
            }],
          }), 'novel-voice: tab type')

          scoped.effect(() => scoped.slots.inject('sidebar.right.pane.tab', () => scoped.slots.register(
            { name: 'sidebar.right.pane.tab', key: TAB_ID, inject: (sessionId) => ({ sessionId, remote }) },
            VoicePanel,
          )), 'novel-voice: tab body')

          scoped.effect(() => scoped.slots.inject('conversation.session.header.utilities', () => scoped.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'dsh-novel-voice-open',
              order: 36,
              inject: () => ({
                open: () => {
                  try { right.openTab(TAB_KIND) } catch (error) { console.error('[novel-voice] openTab 失败', error) }
                },
              }),
            },
            VoiceOpenButton,
          )), 'novel-voice: header button')
        })

        ctx.effect(() => () => {
          try { seat?.() } catch { /* scope already gone */ }
        })
      },
    }
  },
})


