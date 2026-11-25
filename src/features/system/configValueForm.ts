import { UserFacingError } from '../../userMessage'

/** ConfigField 保存表单中的一个配置项，类型决定输入控件，分组与列表可嵌套。 */
export interface ConfigField {
  /** 只用于稳定追踪未保存的输入，不提交到服务端。 */
  id: string
  /** 对象中的字段名；列表项不需要名称。 */
  name: string
  /** 值的存储类型。 */
  kind: 'text' | 'number' | 'boolean' | 'group' | 'list' | 'empty'
  /** 文本、数字或开关当前值。 */
  value: string | number | boolean | null
  /** 分组和列表中的子项。 */
  children: ConfigField[]
}
let nextFieldId = 0
/** newConfigField 为新增配置项生成稳定的表单状态。 */
export function newConfigField(name: string, value: unknown): ConfigField {
  const kind = value === null ? 'empty' : Array.isArray(value) ? 'list' : typeof value === 'object' ? 'group' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text'
  return { id: `config-field-${++nextFieldId}`, name, kind, value: kind === 'text' ? String(value) : kind === 'number' || kind === 'boolean' ? value as number | boolean : null, children: kind === 'list' ? (value as unknown[]).map(v => newConfigField('', v)) : kind === 'group' ? configFields(value as Record<string, unknown>) : [] }
}

/** configFields 将已保存配置恢复为同类型控件，数字字符串不会被转成数字。 */
export function configFields(value: Record<string, unknown>): ConfigField[] {
  return Object.entries(value).map(([name, value]) => newConfigField(name, value))
}

/** configValue 保持嵌套结构及值类型，并拒绝重复名称与未填写的数字。 */
export function configValue(fields: ConfigField[], list = false): Record<string, unknown> | unknown[] {
  const names = new Set<string>()
  const entries = fields.map((f, i) => {
    if (!list && (!f.name.trim() || names.has(f.name))) throw new UserFacingError(`第 ${i + 1} 项的字段名为空或重复，请修改。`)
    names.add(f.name)
    if (f.kind === 'number' && (typeof f.value !== 'number' || !Number.isFinite(f.value))) throw new UserFacingError(`请为“${f.name || `第 ${i + 1} 项`}”填写有效数字。`)
    const value = f.kind === 'group' || f.kind === 'list' ? configValue(f.children, f.kind === 'list') : f.kind === 'empty' ? null : f.value
    return [f.name, value] as const
  })
  return list ? entries.map(([, value]) => value) : Object.fromEntries(entries)
}
