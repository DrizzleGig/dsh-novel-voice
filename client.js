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
     * 1. Theme + primitives
     * ════════════════════════════════════════════════════════════════════════ */
    const C = {
      text: 'var(--dsw-alias-label-primary, #e6e8ee)',
      muted: 'var(--dsw-alias-label-secondary, #9aa3b2)',
      faint: 'var(--dsw-alias-label-secondary, #737b8a)',
      border: 'var(--dsw-alias-border-l1, rgba(148,163,184,.18))',
      surface: 'var(--dsw-alias-bg-l1, rgba(148,163,184,.06))',
      surface2: 'var(--dsw-alias-bg-l2, rgba(148,163,184,.10))',
      accent: 'var(--dsw-alias-brand-primary, #5b8def)',
      ok: 'var(--dsw-alias-state-success, #3fae7a)',
      warn: 'var(--dsw-alias-state-warning, #d6a04a)',
      block: 'var(--dsw-alias-state-danger, #d96a5a)',
      blue: '#5b8def',
      purple: '#8b6cf0',
      green: '#3fae7a',
    }
    const MODE_COLOR = { 'm-immersive': C.blue, 'm-tight': C.purple, 'm-restrained': C.green }
    const MODE_GLYPH = { 'm-immersive': '波', 'm-tight': '紧', 'm-restrained': '敛' }
    const SCENE_ORDER = ['日常过渡', '动作战斗', '悬疑对峙']
    const SCENE_LABEL = { 日常过渡: '日常', 动作战斗: '战斗', 悬疑对峙: '对峙', 对话: '对话', 心理情感: '心理', 描写环境: '描写' }

    const unwrap = (result) => {
      if (result && result.ok === false) {
        throw new Error(result.error?.message ?? result.message ?? 'remote 调用失败')
      }
      return result && result.ok === true && 'value' in result ? result.value : result
    }
    const fmtChars = (value) => {
      const n = Number(value) || 0
      if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`
      return `${n} 字`
    }
    const bytesToBase64 = (bytes) => {
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

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
    }

    function Icon({ name, size = 15, style }) {
      const paths = PATHS[name] ?? PATHS.spark
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { flex: '0 0 auto', ...style },
        'aria-hidden': true,
      }, paths.map((d, index) => h('path', { key: index, d })))
    }

    function IconBtn({ icon, onClick, title, size = 15 }) {
      return h('button', {
        type: 'button',
        onClick,
        title,
        'aria-label': title,
        style: {
          appearance: 'none', border: 'none', background: 'transparent', color: C.muted,
          padding: 5, borderRadius: 6, cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        },
      }, h(Icon, { name: icon, size }))
    }

    function Btn({ children, onClick, primary, danger, disabled, title, style }) {
      return h('button', {
        type: 'button',
        onClick,
        disabled,
        title,
        style: {
          appearance: 'none',
          border: `1px solid ${primary ? C.accent : C.border}`,
          background: primary ? C.accent : 'transparent',
          color: primary ? '#fff' : (danger ? C.block : C.text),
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          lineHeight: '18px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          ...style,
        },
      }, children)
    }

    function Chip({ children, color, bg }) {
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10.5, lineHeight: '18px', padding: '0 7px', borderRadius: 999,
          color: color ?? C.muted,
          border: `1px solid ${color ?? C.border}`,
          background: bg ?? 'transparent',
          whiteSpace: 'nowrap',
        },
      }, children)
    }

    function Card({ children, style, onClick, tone }) {
      return h('div', {
        onClick,
        style: {
          background: C.surface,
          border: `1px solid ${tone ?? C.border}`,
          borderRadius: 10,
          padding: 12,
          ...style,
        },
      }, children)
    }

    function SectionHead({ children, right, icon }) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, margin: '16px 0 8px' } },
        icon ? h(Icon, { name: icon, size: 14, style: { color: C.muted } }) : null,
        h('div', { style: { fontSize: 12.5, fontWeight: 600, color: C.text, letterSpacing: '.01em' } }, children),
        h('div', { style: { flex: 1 } }),
        right ?? null)
    }

    function Bar({ value, color = C.accent, height = 6 }) {
      return h('div', {
        style: { flex: 1, height, borderRadius: 999, background: C.surface2, overflow: 'hidden' },
      }, h('div', {
        style: { width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 999, opacity: 0.9 },
      }))
    }

    function Empty({ icon, title, lines, children }) {
      return h('div', {
        style: {
          border: `1px dashed ${C.border}`, borderRadius: 12, padding: '18px 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
        },
      },
        h(Icon, { name: icon ?? 'spark', size: 22, style: { color: C.muted } }),
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.text } }, title),
        ...(lines ?? []).map((line, index) => h('div', { key: index, style: { fontSize: 11.5, color: C.muted, lineHeight: 1.7 } }, line)),
        children ?? null)
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 2. Tabs
     * ════════════════════════════════════════════════════════════════════════ */
    function WorksTab({ snap, busy, onImportFolder, onImportPath, onImportFiles, onRemove, onMeasure }) {
      const [showPath, setShowPath] = React.useState(false)
      const [pathInput, setPathInput] = React.useState('')
      const [sourceType, setSourceType] = React.useState('reference')
      const [pendingRemove, setPendingRemove] = React.useState(null)
      const inputRef = React.useRef(null)
      const { works, capacity } = snap
      const charsPercent = capacity.charsLimit ? (capacity.chars / capacity.charsLimit) * 100 : 0
      const own = works.filter((work) => work.sourceType === 'own').length
      return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px' } },
          h('div', { style: { fontSize: 11, color: C.muted } }, `${fmtChars(capacity.chars)} / ${fmtChars(capacity.charsLimit)}`),
          h('div', { style: { flex: 1 } }),
          h('div', { style: { fontSize: 11, color: C.faint } }, `${works.length}/${capacity.worksLimit} 部`)),
        h(Bar, { value: charsPercent, height: 5 }),
        h(Card, { style: { marginTop: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },
            h(Icon, { name: 'folder', size: 14, style: { color: C.accent } }),
            h('div', { style: { fontSize: 12, fontWeight: 600 } }, '导入作品'),
            h('div', { style: { flex: 1 } }),
            h('button', {
              type: 'button',
              onClick: () => setShowPath(!showPath),
              style: { appearance: 'none', border: 'none', background: 'transparent', color: C.faint, fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' },
            }, showPath ? '收起路径' : '输入路径')),
          h('div', { style: { display: 'flex', gap: 4, padding: 3, background: C.surface2, borderRadius: 8, marginBottom: 8 } },
            [['reference', '参考作品'], ['own', '我的旧稿']].map(([id, label]) => h('button', {
              key: id,
              type: 'button',
              onClick: () => setSourceType(id),
              style: {
                flex: 1, appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11, padding: '4px 0', borderRadius: 6,
                background: sourceType === id ? C.surface : 'transparent',
                color: sourceType === id ? C.text : C.muted,
                boxShadow: sourceType === id ? `inset 0 0 0 1px ${C.border}` : 'none',
              },
            }, label))),
          h('div', { style: { display: 'flex', gap: 6 } },
            h(Btn, { primary: true, disabled: Boolean(busy), onClick: () => onImportFolder(sourceType), style: { flex: 1 } },
              busy ? '导入中…' : '选文件夹…'),
            h(Btn, { disabled: Boolean(busy), onClick: () => inputRef.current?.click(), style: { flex: 1 } }, '选文件…')),
          h('input', {
            ref: inputRef,
            type: 'file',
            accept: '.txt,.md,text/plain',
            multiple: true,
            style: { display: 'none' },
            onChange: (event) => {
              const picked = [...(event.target.files ?? [])]
              event.target.value = ''
              if (picked.length) onImportFiles(picked, sourceType)
            },
          }),
          h('div', { style: { fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.6 } },
            '文件夹会递归导入其中的 TXT / MD；选文件走浏览器上传，不依赖系统对话框。参考作品学技法；旧稿学“你的呼吸”。'),
          showPath ? h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
            h('input', {
              value: pathInput,
              onChange: (event) => setPathInput(event.target.value),
              placeholder: 'D:\\小说\\夜色山河.txt',
              style: {
                flex: 1, minWidth: 0, background: 'transparent', color: C.text, fontSize: 11.5,
                border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontFamily: 'inherit', outline: 'none',
              },
            }),
            h(Btn, { onClick: () => onImportPath(pathInput, sourceType), disabled: Boolean(busy) || !pathInput.trim() }, '导入')) : null),
        works.length === 0
          ? h(Card, { style: { marginTop: 12, borderStyle: 'dashed' } },
            h('div', { style: { fontSize: 12, color: C.muted, lineHeight: 1.8 } },
              '书架还是空的。先导入 2–3 部你认可的作品；如果你有 3–5 万字自己的旧稿，也一起放进来——这一步决定它学的是“你喜欢的写法”，还是“你怎么写”。'))
          : h('div', { style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
            works.map((work) => h('div', {
              key: work.workId,
              style: {
                display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
              },
            },
              h('div', {
                style: {
                  width: 34, height: 44, borderRadius: 6, flex: '0 0 auto',
                  background: work.sourceType === 'own'
                    ? `linear-gradient(160deg, ${C.green}33, ${C.green}14)`
                    : `linear-gradient(160deg, ${C.accent}33, ${C.purple}1c)`,
                  color: work.sourceType === 'own' ? C.green : C.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600,
                  border: `1px solid ${C.border}`,
                },
              }, (work.title || '?').slice(0, 1)),
              h('div', { style: { minWidth: 0, flex: 1 } },
                h('div', { style: { fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, work.title),
                h('div', { style: { fontSize: 10.5, color: C.muted, marginTop: 3 } },
                  `${fmtChars(work.chars)} · ${work.chapters} 章 · ${work.sourceType === 'own' ? '我的旧稿' : '参考作品'}`)),
              h(Chip, { color: work.status === 'measured' ? C.ok : C.warn },
                work.status === 'measured' ? '已统计' : '待统计'),
              work.status === 'measured'
                ? null
                : h('button', {
                  type: 'button',
                  title: '现在统计这本书（全本地，零模型）',
                  onClick: () => onMeasure(work.workId),
                  disabled: Boolean(busy),
                  style: {
                    appearance: 'none', border: `1px solid ${C.border}`, background: 'transparent',
                    cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 6,
                    fontSize: 10.5, color: C.muted, padding: '2px 6px', fontFamily: 'inherit',
                  },
                }, '统计'),
              pendingRemove === work.workId
                ? h('div', { style: { display: 'flex', gap: 4 } },
                  h(Btn, { danger: true, onClick: () => onRemove(work.workId), style: { padding: '3px 7px', fontSize: 10.5 } }, '确认'),
                  h(Btn, { onClick: () => setPendingRemove(null), style: { padding: '3px 7px', fontSize: 10.5 } }, '取消'))
                : h('button', {
                  type: 'button',
                  title: '从书架移除这本书（本地文件一起删）',
                  onClick: () => setPendingRemove(work.workId),
                  style: {
                    appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 10.5, color: C.faint, padding: '2px 4px', fontFamily: 'inherit',
                  },
                }, '移除'))),
            own === 0
              ? h('div', { style: { fontSize: 10.5, color: C.warn, lineHeight: 1.7, padding: '2px 2px 0' } },
                '还没有你自己的旧稿：现在只能学到“你喜欢的写法”，学不到“你怎么写”。')
              : null,
          ),
        h('div', { style: { fontSize: 10.5, color: C.faint, lineHeight: 1.8, marginTop: 10 } },
          '容量按字符计；统计全在本地，不调用模型。'),
      )
    }

    function StyleTab({ snap, brief, onBrief, briefBusy, onCreateProfile, onSaveWeights, saving, onExtract, extracting }) {
      const profile = snap.profile
      const [draft, setDraft] = React.useState(null)
      const [dirty, setDirty] = React.useState(false)
      const [openRule, setOpenRule] = React.useState(null)

      React.useEffect(() => {
        if (!profile) {
          setDraft(null)
          setDirty(false)
          return
        }
        setDraft({
          global: { ...(profile.blend?.global ?? {}) },
          sceneWeights: JSON.parse(JSON.stringify(profile.blend?.sceneWeights ?? {})),
        })
        setDirty(false)
      }, [profile?.id, profile?.version])

      if (!profile) {
        const canCreate = snap.works.length > 0
        return h('div', null,
          h('div', { style: { height: 12 } }),
          h(Empty, {
            icon: 'spark',
            title: '还没有风格档案',
            lines: [
              '档案由书架里的作品统计而来：统计全在本地，零模型。',
              canCreate ? '书架里已有作品，可以直接用模板建一份，之后再按你的口味改。' : '先在「书架」导入至少一部作品。',
            ],
          },
            h('div', { style: { marginTop: 4 } },
              h(Btn, { primary: true, disabled: !canCreate || briefBusy, onClick: onCreateProfile },
                briefBusy ? '建立中…' : '用模板建档案'))))
      }

      const modes = profile.modes ?? []
      const confirmed = profile.rules.filter((rule) => rule.status === 'confirmed')
      const globalWeights = draft?.global ?? profile.blend?.global ?? {}
      const total = Math.max(0.0001, modes.reduce((sum, mode) => sum + Number(globalWeights[mode.id] ?? 0), 0))

      const changeGlobal = (id, percent) => {
        setDraft((current) => {
          const target = Math.max(0, Math.min(1, percent / 100))
          const others = modes.filter((mode) => mode.id !== id)
          const othersTotal = others.reduce((sum, mode) => sum + Number(current.global[mode.id] ?? 0), 0)
          const remain = 1 - target
          const global = { ...current.global, [id]: target }
          for (const mode of others) {
            const share = othersTotal > 0
              ? Number(current.global[mode.id] ?? 0) / othersTotal
              : 1 / Math.max(1, others.length)
            global[mode.id] = share * remain
          }
          return { ...current, global }
        })
        setDirty(true)
      }
      const changeScene = (scene, modeId) => {
        const next = {}
        for (const mode of modes) next[mode.id] = mode.id === modeId ? 0.6 : 0.2
        setDraft((current) => ({ ...current, sceneWeights: { ...current.sceneWeights, [scene]: next } }))
        setDirty(true)
      }

      return h('div', null,
        h(Card, { style: { marginTop: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, profile.name),
            h('div', { style: { flex: 1 } }),
            h(Chip, { color: profile.status === 'confirmed' ? C.ok : C.warn },
              profile.status === 'confirmed' ? '已确认' : '未确认'),
            h(Chip, null, `v${profile.version}`)),
          h('div', { style: { fontSize: 11.5, color: C.muted, lineHeight: 1.75, marginTop: 8 } },
            profile.identity?.summary || '（还没有总则：用 voice_profile update 写一两句）'),
          h('div', { style: { fontSize: 10.5, color: C.faint, lineHeight: 1.6, marginTop: 6 } },
            `来源：${profile.sources.filter((source) => source.role === 'reference').length} 部参考作品` +
            `${profile.sources.some((source) => source.role === 'own') ? `、${profile.sources.filter((source) => source.role === 'own').length} 部旧稿` : ''}` +
            '。区间、锚点与总则来自它们；技法卡来自模板，或点「从作品提取」用模型提取带引文的卡。'),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' } },
            h(Chip, null, `${confirmed.length} 张技法`),
            h(Chip, null, `${profile.anchors.length} 条锚点`),
            h(Chip, null, `${profile.samples.length} 段样段`),
            snap.contract?.available ? h(Chip, { color: C.ok }, '契约已接') : null)),

        h(SectionHead, { icon: 'sliders' }, '当前风格模式'),
        h('div', { style: { display: 'flex', gap: 6 } },
          modes.map((mode) => {
            const weight = Number(globalWeights[mode.id] ?? 0) / total
            const active = weight > 0.15
            const color = MODE_COLOR[mode.id] ?? C.accent
            return h('div', {
              key: mode.id,
              style: {
                flex: 1, padding: '7px 8px', borderRadius: 9, textAlign: 'center',
                border: `1px solid ${active ? color : C.border}`,
                background: active ? `${color}22` : 'transparent',
                color: active ? C.text : C.faint,
                fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              },
            },
              h('span', {
                style: { width: 16, height: 16, borderRadius: 999, background: active ? color : C.surface2, color: active ? '#fff' : C.muted, fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
              }, MODE_GLYPH[mode.id] ?? '·'),
              mode.name)
          })),

        h(SectionHead, {
          icon: 'sliders',
          right: dirty
            ? h(Btn, { primary: true, disabled: saving, onClick: () => onSaveWeights(draft) }, saving ? '保存中…' : '保存权重')
            : h('span', { style: { fontSize: 10.5, color: C.faint } }, '拖动即可调'),
        }, '全局混合权重'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          modes.map((mode) => {
            const raw = Number(globalWeights[mode.id] ?? 0)
            const percent = Math.round((raw / total) * 100)
            const color = MODE_COLOR[mode.id] ?? C.accent
            return h('div', { key: mode.id, style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { width: 7, height: 7, borderRadius: 999, background: color } }),
              h('div', { style: { width: 40, fontSize: 11, color: C.muted } }, mode.name),
              h('input', {
                type: 'range', min: 0, max: 100, step: 5, value: Math.round(raw * 100),
                onChange: (event) => changeGlobal(mode.id, Number(event.target.value)),
                style: { flex: 1, minWidth: 0, accentColor: color, height: 18, cursor: 'pointer' },
                'aria-label': `${mode.name}权重`,
              }),
              h('div', { style: { width: 34, textAlign: 'right', fontSize: 11, color: C.muted } }, `${percent}%`))
          })),

        h(SectionHead, { icon: 'spark' }, '场景权重'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          SCENE_ORDER.map((scene) => {
            const sceneWeights = draft?.sceneWeights?.[scene] ?? profile.blend?.sceneWeights?.[scene] ?? {}
            const top = Object.entries(sceneWeights).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
            const topMode = top?.[0]
            return h('div', { key: scene, style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h('div', { style: { width: 34, fontSize: 11, color: C.muted } }, SCENE_LABEL[scene] ?? scene),
              modes.map((mode) => {
                const active = mode.id === topMode
                const color = MODE_COLOR[mode.id] ?? C.accent
                return h('button', {
                  key: mode.id,
                  type: 'button',
                  onClick: () => changeScene(scene, mode.id),
                  style: {
                    flex: 1, appearance: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 10.5, padding: '3px 0', borderRadius: 6,
                    border: `1px solid ${active ? color : C.border}`,
                    background: active ? `${color}22` : 'transparent',
                    color: active ? C.text : C.faint,
                  },
                }, mode.name)
              }),
              h('div', { style: { width: 30, textAlign: 'right', fontSize: 10, color: C.faint } },
                top ? `${Math.round(Number(top[1]) * 100)}%` : '—'))
          })),
        h('div', { style: { fontSize: 10, color: C.faint, lineHeight: 1.6, marginTop: 6 } },
          '权重会改变【写法】里规则的排序：同一场景下，权重高的模式先出它的规则。'),

        h(SectionHead, {
          icon: 'book',
          right: h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('span', { style: { fontSize: 10.5, color: C.faint } }, `${profile.rules.length} 张`),
            h(Btn, {
              onClick: onExtract,
              disabled: extracting,
              title: '调用模型，从书架作品里提取带原文引文的技法卡（会写进「学习」等你确认）',
              style: { padding: '2px 8px', fontSize: 10.5 },
            }, extracting ? '提取中…' : '从作品提取')),
        }, '技法卡'),
        profile.rules.length === 0
          ? h('div', { style: { fontSize: 11.5, color: C.muted } }, '还没有技法卡：在对话里 voice_profile templates → apply。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            profile.rules.slice(0, 10).map((rule) => {
              const tone = rule.status === 'confirmed' ? C.ok : rule.status === 'candidate' ? C.warn : C.muted
              const open = openRule === rule.id
              return h('div', {
                key: rule.id,
                onClick: () => setOpenRule(open ? null : rule.id),
                style: {
                  position: 'relative', padding: '10px 10px 10px 14px', background: C.surface,
                  border: `1px solid ${open ? tone : C.border}`, borderRadius: 9, overflow: 'hidden', cursor: 'pointer',
                },
              },
                h('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone, opacity: 0.9 } }),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('div', { style: { fontSize: 12, fontWeight: 600, flex: 1 } }, rule.title),
                  rule.evidence === 0 ? h(Chip, null, '模板') : null,
                  h(Chip, { color: tone }, rule.status === 'confirmed' ? '已确认' : rule.status === 'candidate' ? '待确认' : rule.status)),
                h('div', {
                  style: {
                    fontSize: 10.8, color: C.muted, lineHeight: 1.65, marginTop: 5,
                    display: open ? 'block' : '-webkit-box',
                    WebkitLineClamp: open ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  },
                }, rule.instruction || ''),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: C.faint } },
                  h('span', null, `证据 ${rule.evidence}${rule.counterexamples ? ` · 反例 ${rule.counterexamples}` : ''}`),
                  rule.scope?.length ? h('span', null, rule.scope.map((item) => SCENE_LABEL[item] ?? item).join(' / ')) : h('span', null, '通用'),
                  rule.check ? h('span', null, `检查 ${rule.check}`) : null,
                  h('span', { style: { marginLeft: 'auto' } }, open ? '收起' : '展开')),
                open
                  ? h('div', {
                    style: { marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6 },
                  },
                    (rule.evidenceItems ?? []).length
                      ? rule.evidenceItems.map((item, index) => h('div', { key: index, style: { fontSize: 10.5, color: C.muted, lineHeight: 1.65 } },
                        h('span', { style: { color: C.faint } }, item.chapter ? `第 ${item.chapter} 章 · ` : ''),
                        `「${item.quote}」`))
                      : h('div', { style: { fontSize: 10.5, color: C.faint, lineHeight: 1.6 } },
                        '模板卡：没有原文证据。点上方「从作品提取」，让模型从参考作品里提取带引文的技法卡；提完去「学习」确认。'))
                  : null)
            })),

        h(SectionHead, {
          icon: 'pen',
          right: h(Btn, { onClick: onBrief, disabled: briefBusy }, briefBusy ? '编译中…' : '生成简报'),
        }, '写前简报'),
        brief?.markdown
          ? h('pre', {
            style: {
              margin: 0, padding: 12, borderRadius: 10, background: C.surface2, color: C.text,
              fontSize: 11.2, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'inherit', maxHeight: 340, overflow: 'auto', border: `1px solid ${C.border}`,
            },
          }, brief.markdown)
          : h('div', { style: { fontSize: 11.5, color: C.muted, lineHeight: 1.7 } },
            '按当前场景编译 3–5 条写法、禁语与锚点；有旧稿时再附一段你自己的段落。'),
        brief?.warnings?.length
          ? h('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 } }, brief.warnings.map((warning, index) =>
            h('div', { key: index, style: { fontSize: 10.5, color: C.warn, lineHeight: 1.6 } }, `· ${warning}`)))
          : null,
      )
    }

    function LearnTab({ snap, onAccept, onReject, onAggregate, onSetRule }) {
      const candidates = (snap.profile?.rules ?? []).filter((rule) => rule.status === 'candidate')
      return h('div', null,
        h(SectionHead, { icon: 'book' }, `候选技法（${candidates.length}）`),
        candidates.length === 0
          ? h('div', {
            style: { fontSize: 11.5, color: C.muted, lineHeight: 1.75, padding: '10px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9 },
          }, '没有候选技法。在「风格」点「从作品提取」，模型会从参考作品里提取带引文的技法卡，先落在这里等你确认。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            candidates.map((rule) => h(Card, { key: rule.id },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                h('div', { style: { fontSize: 12, fontWeight: 600, flex: 1 } }, rule.title),
                h(Chip, { color: C.ok }, `证据 ${rule.evidence}`)),
              h('div', { style: { fontSize: 11, color: C.muted, lineHeight: 1.65, marginTop: 5 } }, rule.instruction || ''),
              (rule.evidenceItems ?? []).slice(0, 2).map((item, index) => h('div', {
                key: index, style: { fontSize: 10.5, color: C.faint, lineHeight: 1.6, marginTop: 4 },
              }, item.chapter ? `第 ${item.chapter} 章 · ` : '', `「${item.quote}」`)),
              h('div', { style: { display: 'flex', gap: 6, marginTop: 9 } },
                h(Btn, { primary: true, onClick: () => onSetRule(rule, 'confirmed') }, h(Icon, { name: 'check', size: 13 }), '确认'),
                h(Btn, { onClick: () => onSetRule(rule, 'rejected') }, '忽略'))))),

        h(SectionHead, {
          icon: 'spark',
          right: h(Btn, { onClick: onAggregate }, '重新聚合'),
        }, '待确认'),
        snap.pending.length === 0
          ? h('div', {
            style: { fontSize: 11.5, color: C.muted, lineHeight: 1.75, padding: '10px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9 },
          }, '没有待确认的候选。反馈要同一处出现两次才进候选，而且不会自动写进档案。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            snap.pending.map((candidate) => h(Card, { key: candidate.id },
              h('div', { style: { fontSize: 12, color: C.text, lineHeight: 1.65 } }, candidate.text || '（来自改稿的行为）'),
              h('div', { style: { display: 'flex', gap: 6, marginTop: 7 } },
                h(Chip, null, candidate.kind),
                h(Chip, { color: C.warn }, `支持 ${candidate.supports}`),
                candidate.scope?.scene ? h(Chip, null, SCENE_LABEL[candidate.scope.scene] ?? candidate.scope.scene) : null),
              h('div', { style: { display: 'flex', gap: 6, marginTop: 9 } },
                h(Btn, { primary: true, onClick: () => onAccept(candidate) }, h(Icon, { name: 'check', size: 13 }), '确认'),
                h(Btn, { onClick: () => onReject(candidate) }, '忽略'))))),

        h(SectionHead, { icon: 'book' }, '最近记录'),
        snap.feedback.length === 0
          ? h('div', { style: { fontSize: 11.5, color: C.muted } }, '还没有反馈。可以在对话里用 voice_feedback record 记一条。')
          : h('div', { style: { display: 'flex', flexDirection: 'column' } },
            snap.feedback.map((event) => h('div', {
              key: event.id,
              style: { display: 'flex', gap: 8, padding: '7px 0', borderBottom: `1px dashed ${C.border}`, fontSize: 11, color: C.muted },
            },
              h('span', { style: { color: C.text, flex: '0 0 auto' } }, event.kind),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, event.text || '（改稿）'),
              h('span', { style: { color: C.faint, flex: '0 0 auto' } }, String(event.at).slice(5, 10))))),

        h(SectionHead, { icon: 'refresh' }, '版本'),
        h('div', { style: { fontSize: 11, color: C.muted, lineHeight: 1.75 } },
          `当前档案 v${snap.profile?.version ?? '—'}；每次确认、改权重、回滚都会多一个快照。回滚用 voice_profile rollback。`),
      )
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 3. Panel
     * ════════════════════════════════════════════════════════════════════════ */
    function VoicePanel({ sessionId, remote }) {
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [mode, setMode] = React.useState(false)
      const [snap, setSnap] = React.useState(null)
      const [tab, setTab] = React.useState('shelf')
      const [brief, setBrief] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [toast, setToast] = React.useState(null)

      const load = React.useCallback(async () => {
        if (!remote || !sessionId) {
          setPhase('error')
          setError('面板服务还没挂载')
          return
        }
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

      const makeBrief = async () => {
        setBusy('brief')
        try {
          const result = await remote.brief(sessionId, {}).then(unwrap)
          setBrief(result)
          setTab('style')
        } catch (cause) {
          setToast(String(cause?.message ?? cause))
        } finally {
          setBusy(null)
        }
      }

      const importFolder = (sourceType) => run('import-folder', async () => {
        const result = await remote.importFolder(sessionId, { sourceType }).then(unwrap)
        if (result?.cancelled) {
          setToast('已取消')
          return
        }
        const imported = result?.imported?.length ?? 0
        const skipped = result?.skipped?.length ?? 0
        if (imported) {
          await remote.measureWorks(sessionId, {}).then(unwrap)
          setToast(`导入 ${imported} 部 · 已统计`)
        } else {
          setToast(skipped ? '这个文件夹里的作品已在书架里' : '没有找到 TXT / MD')
        }
      }, null)

      const importFiles = (files, sourceType) => run('import-files', async () => {
        const list = []
        let total = 0
        for (const file of files.slice(0, 20)) {
          if (file.size > 6_000_000) throw new Error(`${file.name} 超过 6 MB；大文件请用「选文件夹」导入。`)
          total += file.size
          if (total > 20_000_000) throw new Error('一次最多约 20 MB；请分批。')
          const buffer = await file.arrayBuffer()
          // 送原始字节，让主机按 UTF-8 / GB18030 探测；直接读文本会把 GBK 变成乱码。
          list.push({ name: file.name, base64: bytesToBase64(new Uint8Array(buffer)) })
        }
        if (!list.length) throw new Error('没有选择文件')
        const result = await remote.importTexts(sessionId, { files: list, sourceType }).then(unwrap)
        const imported = result?.imported?.length ?? 0
        const skipped = result?.skipped ?? []
        if (imported) {
          await remote.measureWorks(sessionId, {}).then(unwrap)
          setToast(`导入 ${imported} 部 · 已统计`)
        } else if (skipped.length) {
          const first = skipped[0]
          setToast(first?.message || (first?.reason === 'duplicate' ? '这些文件已在书架里' : '没有可导入的文件'))
        } else {
          setToast('没有可导入的文件')
        }
      }, null)

      const measureWorks = (workIds) => run('measure', async () => {
        const result = await remote.measureWorks(sessionId, { workIds }).then(unwrap)
        const done = (result?.measured ?? []).filter((item) => item.ok).length
        setToast(`统计完成 ${done} 部`)
      }, null)

      const extractTechniques = () => run('extract', async () => {
        const result = await remote.extractTechniques(sessionId, { mode: 'quick' }).then(unwrap)
        if (result?.added) {
          setToast(`提取 ${result.added} 张候选技法，去「学习」确认`)
          setTab('learn')
        } else {
          setToast(result?.accepted === 0 ? '没有提取到可用技法（引文没通过校验）' : `已写进档案：${result?.added ?? 0} 张`)
        }
      }, null)

      const setRule = (rule, status) => run('rule', async () => {
        await remote.setRuleStatus(sessionId, { ruleId: rule.id, status }).then(unwrap)
      }, status === 'confirmed' ? '已确认，下一份简报生效' : '已忽略')

      const importPath = (value, sourceType) => run('import-path', async () => {
        if (!String(value ?? '').trim()) throw new Error('先填一个路径')
        const result = await remote.importPath(sessionId, { path: value, sourceType }).then(unwrap)
        const imported = result?.imported?.length ?? 0
        if (imported) {
          await remote.measureWorks(sessionId, {}).then(unwrap)
          setToast(`导入 ${imported} 部 · 已统计`)
        } else {
          setToast('没有可导入的文件')
        }
      })

      const removeWork = (workId) => run('remove', async () => {
        const result = await remote.removeWork(sessionId, { workId }).then(unwrap)
        setToast(`已移除《${result?.title ?? workId}》`)
      }, null)

      const createProfile = () => run('create', async () => {
        const result = await remote.createProfile(sessionId, {}).then(unwrap)
        setToast(`档案 v${result?.profile?.version ?? '1.1'} 已建立`)
        setTab('style')
      }, null)

      const saveWeights = (draft) => run('weights', async () => {
        if (!draft) throw new Error('没有可保存的权重')
        await remote.saveWeights(sessionId, {
          blend: { global: draft.global, sceneWeights: draft.sceneWeights },
        }).then(unwrap)
      }, '权重已保存，下一次简报生效')

      const accept = (candidate) => run('accept', async () => {
        await remote.acceptCandidate(sessionId, { candidateId: candidate.id }).then(unwrap)
      }, '已写进档案')

      const reject = (candidate) => run('reject', async () => {
        await remote.rejectCandidate(sessionId, { candidateId: candidate.id }).then(unwrap)
      }, '已忽略')

      const aggregate = () => run('aggregate', async () => {
        await remote.aggregate(sessionId, {}).then(unwrap)
      }, '已重新聚合')

      const tabs = [
        ['shelf', '书架', 'book', snap?.works?.length ?? 0],
        ['style', '风格', 'sliders', snap?.profile?.rules?.length ?? 0],
        ['learn', '学习', 'spark', snap?.pending?.length ?? 0],
      ]

      const body = phase === 'loading'
        ? h('div', { style: { padding: 20, fontSize: 11.5, color: C.muted } }, '读取中…')
        : phase === 'error'
          ? h('div', { style: { padding: 12 } }, h(Empty, {
            icon: 'alert', title: '面板读取失败', lines: [error || '未知错误', '点右上角刷新重试。'],
          }))
          : tab === 'shelf'
            ? h(WorksTab, {
              snap,
              busy: Boolean(busy && (String(busy).startsWith('import') || busy === 'measure')),
              onImportFolder: importFolder,
              onImportPath: importPath,
              onImportFiles: importFiles,
              onRemove: removeWork,
              onMeasure: measureWorks,
            })
            : tab === 'style'
              ? h(StyleTab, {
                snap,
                brief,
                onBrief: makeBrief,
                briefBusy: busy === 'brief' || busy === 'create',
                onCreateProfile: createProfile,
                onSaveWeights: saveWeights,
                saving: busy === 'weights',
                onExtract: extractTechniques,
                extracting: busy === 'extract',
              })
              : h(LearnTab, { snap, onAccept: accept, onReject: reject, onAggregate: aggregate, onSetRule: setRule })

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: C.text, fontSize: 12 },
      },
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px 10px',
            borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 2,
            background: 'var(--dsw-alias-bg-base, transparent)',
          },
        },
          h('div', {
            style: {
              width: 30, height: 30, borderRadius: 8, flex: '0 0 auto',
              background: `linear-gradient(150deg, ${C.accent}44, ${C.purple}22)`,
              border: `1px solid ${C.border}`, color: C.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
          }, h(Icon, { name: 'pen', size: 16 })),
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('div', { style: { fontSize: 13.5, fontWeight: 600, letterSpacing: '.01em' } }, '风格工作室'),
            h('div', {
              style: { fontSize: 10.5, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, `《${snap?.book ?? '—'}》 · ${snap?.works?.length ?? 0} 部 · 档案 v${snap?.profile?.version ?? '—'}`)),
          h(Btn, {
            onClick: toggleMode,
            disabled: busy === 'mode',
            title: '切换 /voice on | off',
            style: {
              padding: '4px 9px', fontSize: 11, borderRadius: 999,
              border: `1px solid ${mode ? C.ok : C.border}`,
              color: mode ? C.ok : C.muted,
              background: mode ? `${C.ok}18` : 'transparent',
            },
          }, h('span', { style: { width: 6, height: 6, borderRadius: 999, background: mode ? C.ok : C.faint } }), mode ? '开' : '关'),
          h(IconBtn, { icon: 'refresh', onClick: load, title: '重新读取' })),

        h('div', { style: { display: 'flex', gap: 2, padding: '0 8px', borderBottom: `1px solid ${C.border}` } },
          tabs.map(([id, label, icon, count]) => h('button', {
            key: id,
            type: 'button',
            onClick: () => setTab(id),
            style: {
              appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
              flex: 1, padding: '9px 4px 8px', fontSize: 12, fontFamily: 'inherit',
              color: tab === id ? C.text : C.muted,
              borderBottom: `2px solid ${tab === id ? C.accent : 'transparent'}`,
              marginBottom: -1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            },
          },
            h(Icon, { name: icon, size: 14, style: { opacity: tab === id ? 1 : 0.65 } }),
            label,
            count ? h('span', {
              style: {
                fontSize: 9.5, lineHeight: '14px', minWidth: 14, padding: '0 4px', borderRadius: 999,
                background: C.surface2, color: C.faint,
              },
            }, count) : null))),

        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' } },
          mode ? null : h('div', {
            style: {
              marginTop: 10, padding: '8px 10px', borderRadius: 8, background: `${C.warn}18`,
              border: `1px solid ${C.warn}44`, fontSize: 10.8, color: C.warn, lineHeight: 1.6,
            },
          }, '创作风格现在是关的：voice_* 工具在会话里不可见。点右上角「关」开启。'),
          body),

        h('div', {
          style: { borderTop: `1px solid ${C.border}`, padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
        },
          h(Btn, {
            primary: true,
            onClick: makeBrief,
            disabled: busy === 'brief' || !snap?.profile,
            style: { width: '100%', padding: '9px 12px', fontSize: 12.5, borderRadius: 9 },
          }, h(Icon, { name: 'spark', size: 15 }), busy === 'brief' ? '编译中…' : '生成文风简报'),
          h('div', {
            style: { fontSize: 10.3, color: toast ? C.warn : C.faint, textAlign: 'center', minHeight: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, toast || '检查与改写：在对话里用 voice_check / voice_polish。')),
      )
    }

    function VoiceOpenButton({ open }) {
      return h('button', {
        type: 'button',
        onClick: open,
        style: {
          appearance: 'none', border: `1px solid ${C.border}`, background: 'transparent',
          color: C.muted, borderRadius: 7, padding: '3px 9px', fontSize: 11.5,
          lineHeight: '18px', cursor: 'pointer', fontFamily: 'inherit', marginRight: 6,
          display: 'inline-flex', alignItems: 'center', gap: 5,
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
