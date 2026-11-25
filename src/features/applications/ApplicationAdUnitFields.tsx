import { Alert, Button, Form, Input, Typography } from 'antd'
import { maxRewardedAdUnits, parseRewardedAdUnits } from '../../applicationAdUnits'

interface Props {
  /** 已启用的广告或混合应用必须配齐两类广告位。 */
  required: boolean
  /** 只读或保存过程中禁止增删输入框。 */
  disabled: boolean
  /** 历史插屏多值必须明确选择，避免保存时静默截断数据。 */
  previousInterstitial?: string[]
}

/** ApplicationAdUnitFields 共用新增、编辑和单独配置广告位的校验与交互。 */
export function ApplicationAdUnitFields({ required, disabled, previousInterstitial = [] }: Props) {
  const form = Form.useFormInstance()
  return <>
    <Typography.Paragraph type="secondary">激励视频支持多个广告位，服务端为同一用户分配固定广告位，调整候选集合后可能变化；插屏配置一个广告位。纯内购应用无需配置广告位。</Typography.Paragraph>
    <Form.List name="rewardedVideo" rules={[{ validator: async (_, value: string[] | undefined) => {
      const codes = parseRewardedAdUnits((value ?? []).join('\n'))
      if (required && !codes.length) throw new Error('已启用的应用必须配置激励视频 code')
      if (codes.length > maxRewardedAdUnits) throw new Error(`激励视频最多配置 ${maxRewardedAdUnits} 个 code`)
    } }]}>
      {(fields, { add, remove }, { errors }) => <div className="ad-unit-list">
        <Typography.Paragraph type="secondary">每个输入框填写一个激励视频 code，最多 {maxRewardedAdUnits} 个；空值和重复 code 会在保存时自动去除。</Typography.Paragraph>
        {fields.map((field, index) => <div className="ad-unit-row" key={field.key}>
          <Form.Item name={field.name} label={`激励视频 code ${index + 1}`} rules={[{ validator: async (_, value: string | undefined) => {
            if ((value?.trim().length ?? 0) > 255) throw new Error('每个 code 最多 255 个字符')
          } }]}>
            <Input disabled={disabled} placeholder="输入激励视频广告位 code" maxLength={255} />
          </Form.Item>
          <Button danger className="ad-unit-remove" aria-label={`删除广告位 ${index + 1}`} disabled={disabled} onClick={() => remove(field.name)}>删除</Button>
        </div>)}
        <Button type="dashed" disabled={disabled || fields.length >= maxRewardedAdUnits} onClick={() => add('')}>添加激励广告位</Button>
        <Form.ErrorList errors={errors} />
      </div>}
    </Form.List>
    {previousInterstitial.length > 1 && <Alert type="warning" showIcon title="请确定该类型保留的 code" description={`原有配置：${previousInterstitial.join('、')}。请填写一个 code；如需全部移除，请先填写再清空。`} />}
    <Form.Item name="interstitial" label="插屏 code" rules={[
      { required, transform: (value: string) => value?.trim(), whitespace: true, message: '已启用的应用必须配置插屏 code' },
      { validator: async (_, value: string | undefined) => {
        if ((value?.trim().length ?? 0) > 255) throw new Error('每个 code 最多 255 个字符')
        if (previousInterstitial.length > 1 && !form.isFieldTouched('interstitial')) throw new Error('请确认该类型保留的 code')
      } },
    ]}><Input disabled={disabled} placeholder="输入插屏广告位 code" maxLength={255} /></Form.Item>
  </>
}
