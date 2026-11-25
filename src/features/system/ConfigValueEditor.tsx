import { Button, Card, Col, Empty, Flex, Form, Input, InputNumber, Row, Select, Switch, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'

import { newConfigField, type ConfigField } from './configValueForm'

const types = [{ value: 'text', label: '文本' }, { value: 'number', label: '数字' }, { value: 'boolean', label: '开关' }, { value: 'group', label: '分组' }, { value: 'list', label: '列表' }, { value: 'empty', label: '空值' }]

interface Props {
  /** 当前配置项草稿。 */
  value: ConfigField[]
  /** 更新当前草稿。 */
  onChange(value: ConfigField[]): void
  /** 禁止修改但仍展示全部值。 */
  disabled: boolean
  /** 列表按顺序存储，不要求逐项命名。 */
  list?: boolean
  /** 为嵌套控件提供唯一可访问名称。 */
  path?: string
}

/** ConfigValueEditor 为新建与已有自定义配置提供同一套可视化值编辑器。 */
export function ConfigValueEditor({ value, onChange, disabled, list = false, path = 'value' }: Props) {
  const update = (id: string, next: ConfigField) => onChange(value.map(f => f.id === id ? next : f))
  return <Flex vertical gap="small">
    {!value.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={list ? '列表暂无内容' : '暂无配置项，点击下方添加'} />}
    {value.map((f, i) => {
      const label = `${path} 第 ${i + 1} 项`
      return <Card key={f.id} size="small" title={list ? `第 ${i + 1} 项` : f.name || '新配置项'} extra={<Button type="text" danger icon={<Trash2 size={14} />} aria-label={`${label} 删除`} disabled={disabled} onClick={() => onChange(value.filter(item => item.id !== f.id))} />}>
        <Row gutter={16}>
          {!list && <Col xs={24} sm={12}><Form.Item label="字段名" required><Input aria-label={`${label} 字段名`} disabled={disabled} value={f.name} onChange={e => update(f.id, { ...f, name: e.target.value })} placeholder="填写配置项名称" /></Form.Item></Col>}
          <Col xs={24} sm={12}><Form.Item label="值类型"><Select aria-label={`${label} 值类型`} disabled={disabled} value={f.kind} options={types} onChange={(kind: ConfigField['kind']) => update(f.id, { ...f, kind, value: kind === 'text' ? '' : kind === 'number' ? 0 : kind === 'boolean' ? false : null, children: [] })} /></Form.Item></Col>
          <Col span={24}>{f.kind === 'group' || f.kind === 'list' ? <ConfigValueEditor value={f.children} disabled={disabled} list={f.kind === 'list'} path={label} onChange={children => update(f.id, { ...f, children })} /> : <Form.Item label="值">
            {f.kind === 'text' ? <Input.TextArea aria-label={`${label} 值`} disabled={disabled} autoSize={{ minRows: 1, maxRows: 5 }} autoComplete="off" value={String(f.value ?? '')} onChange={e => update(f.id, { ...f, value: e.target.value })} /> : f.kind === 'number' ? <InputNumber aria-label={`${label} 值`} disabled={disabled} value={f.value as number | null} onChange={next => update(f.id, { ...f, value: next })} /> : f.kind === 'boolean' ? <Switch aria-label={`${label} 值`} disabled={disabled} checked={Boolean(f.value)} checkedChildren="开启" unCheckedChildren="关闭" onChange={next => update(f.id, { ...f, value: next })} /> : <Typography.Text type="secondary">不设置值</Typography.Text>}
          </Form.Item>}</Col>
        </Row>
      </Card>
    })}
    <Button type="dashed" icon={<Plus size={14} />} disabled={disabled} onClick={() => onChange([...value, newConfigField('', '')])}>{list ? '添加列表项' : '添加配置项'}</Button>
  </Flex>
}
