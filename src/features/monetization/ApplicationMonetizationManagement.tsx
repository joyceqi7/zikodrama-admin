import {
  Alert, Button, Col, Descriptions, Divider, Flex, Form, Input, InputNumber, Row, Select, Spin, Switch, Typography,
} from 'antd'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ApiError, type OperationsApi } from '../../api'
import type {
  ApplicationMonetization, ApplicationMonetizationInput,
} from '../../domain'
import { toUserMessage } from '../../userMessage'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'

interface ApplicationMonetizationManagementProps {
  api: OperationsApi
  applicationName: string
  rewardedAdUnitCodes: string[]
  canUpdate: boolean
  notify: (message: string, tone?: 'success' | 'error') => void
  onDirtyChange?: (dirty: boolean) => void
}

export function ApplicationMonetizationManagement({
  api, applicationName, rewardedAdUnitCodes, canUpdate, notify, onDirtyChange,
}: ApplicationMonetizationManagementProps) {
  const [input, setInput] = useState<ApplicationMonetizationInput | null>(null)
  const [baseline, setBaseline] = useState<ApplicationMonetizationInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const dirty = input !== null && baseline !== null && JSON.stringify(input) !== JSON.stringify(baseline)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const config = await api.getApplicationMonetization()
      const next = toInput(config)
      setInput(next)
      setBaseline(next)
    } catch (error) {
      // 新建应用没有配置记录是正常的首次使用状态，不应展示为系统故障。
      // 预选第一个已登记的激励广告位，让运营人员可以直接调整并保存首版策略。
      if (error instanceof ApiError && error.status === 404 && error.code === 'not_found') {
        const next = emptyInput(rewardedAdUnitCodes)
        setInput(next)
        setBaseline(next)
        return
      }
      const failure = errorMessage(error)
      setLoadError(failure)
      notify(failure, 'error')
    } finally {
      setLoading(false)
    }
  }, [api, notify, rewardedAdUnitCodes])

  useEffect(() => {
    void load()
  }, [load])

  useLayoutEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const save = async () => {
    if (!input || !canUpdate) return
    const validationError = validateInput(input, rewardedAdUnitCodes)
    if (validationError) {
      notify(validationError, 'error')
      return
    }
    setSaving(true)
    try {
      const saved = await api.updateApplicationMonetization(input)
      const next = toInput(saved)
      setInput(next)
      setBaseline(next)
      notify('当前应用的变现设置已保存')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !input) return <Spin description="正在加载变现设置…" fullscreen />

  if (loadError && !input) {
    return (
      <PageStack>
        <PageHeader title="变现设置" actions={<Button size="small" onClick={() => void load()}>重试</Button>} />
        <Alert type="error" showIcon title="变现设置加载失败" description={loadError} />
      </PageStack>
    )
  }

  if (!input) return null
  const adUnitOptions = rewardedAdUnitCodes.map((code) => ({ value: code, label: code }))

  return (
    <section aria-labelledby="application-monetization-title">
      <PageStack>
        <PageHeader
          id="application-monetization-title"
          title="变现设置"
          eyebrow="基础逐集解锁始终生效；VIP 策略是锁定剧集上的可选获取方式。"
          actions={<Button size="small" loading={loading} onClick={() => void load()}>刷新</Button>}
        />
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} aria-label="当前应用变现上下文">
          <Descriptions.Item label="当前应用">{applicationName}</Descriptions.Item>
          <Descriptions.Item label="广告位来源">当前应用记录的激励视频编码</Descriptions.Item>
        </Descriptions>

        {rewardedAdUnitCodes.length === 0 && (
          <Alert
            type="warning"
            showIcon
            title="没有可用的激励视频广告位"
            description="请先在「应用管理」的广告位配置中填写当前应用的激励视频广告位。"
          />
        )}

        <Form layout="vertical" onFinish={() => void save()} disabled={saving || !canUpdate}>
          <SectionHeader title="基础解锁" />
          <Typography.Paragraph type="secondary">
            免费集可直接播放；超过免费范围后，用户完整观看一次激励广告即可从当前集起解锁指定集数。每日上限按应用时区计算，0 表示不限。
          </Typography.Paragraph>
          <Row gutter={24}>
            <NumberField
              id="free-episode-count"
              label="免费集数"
              min={0}
              max={10_000}
              value={input.freeEpisodeCount}
              onChange={(freeEpisodeCount) => setInput({ ...input, freeEpisodeCount })}
            />
            <NumberField
              id="unlock-episode-count"
              label="每次广告解锁集数"
              min={1}
              max={10_000}
              value={input.unlockEpisodeCount ?? 1}
              onChange={(unlockEpisodeCount) => setInput({ ...input, unlockEpisodeCount })}
            />
            <NumberField
              id="daily-reward-limit"
              label="每日逐集奖励上限（0 表示不限）"
              min={0}
              max={10_000}
              value={input.dailyRewardLimit ?? 0}
              onChange={(dailyRewardLimit) => setInput({ ...input, dailyRewardLimit })}
            />
            <Col xs={24} md={12}>
              <Form.Item
                label="逐集解锁广告位"
                required
                help="直接引用当前应用登记的激励视频广告位编码。"
              >
                <Select
                  aria-label="逐集解锁广告位"
                  value={input.episodeUnlockAdUnitCode || undefined}
                  placeholder="选择一个激励视频广告位"
                  options={adUnitOptions}
                  onChange={(episodeUnlockAdUnitCode) => setInput({ ...input, episodeUnlockAdUnitCode })}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />
          <SectionHeader
            title="VIP 策略"
            actions={(
              <Flex align="center" gap="small">
                <Typography.Text type="secondary">启用 VIP 策略</Typography.Text>
                <Switch
                  aria-label="启用 VIP 策略"
                  checked={input.vipStrategy.enabled}
                  onChange={(enabled) => setInput({
                    ...input,
                    vipStrategy: enabled
                      ? {
                          ...input.vipStrategy,
                          enabled: true,
                          requiredAdCount: Math.max(1, input.vipStrategy.requiredAdCount),
                          adUnitCode: input.vipStrategy.adUnitCode || input.episodeUnlockAdUnitCode,
                        }
                      : { ...input.vipStrategy, enabled: false, forceWatchCount: 0, requiredAdCount: 0, delaySeconds: 0, adUnitCode: '' },
                  })}
                />
              </Flex>
            )}
          />
          <Typography.Paragraph type="secondary">
            开启后，用户可从小程序首页入口观看 VIP 广告，达标后手动领取当日 VIP；关闭不会影响逐集广告解锁。
          </Typography.Paragraph>

          {input.vipStrategy.enabled && (
            <>
              <Row gutter={24}>
                <NumberField
                  id="vip-required-ad-count"
                  label="获得当日 VIP 所需广告数"
                  min={1}
                  max={10}
                  value={input.vipStrategy.requiredAdCount}
                  onChange={(requiredAdCount) => setInput({
                    ...input,
                    vipStrategy: { ...input.vipStrategy, requiredAdCount },
                  })}
                />
                <Col xs={24} md={12}>
                  <Form.Item
                    label="VIP 广告位"
                    required
                    help="可以与逐集解锁使用同一个广告位。"
                  >
                    <Select
                      aria-label="VIP 广告位"
                      value={input.vipStrategy.adUnitCode || undefined}
                      placeholder="选择一个激励视频广告位"
                      options={adUnitOptions}
                      onChange={(adUnitCode) => setInput({
                        ...input,
                        vipStrategy: { ...input.vipStrategy, adUnitCode },
                      })}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Divider />
              <SectionHeader title="VIP 弹窗文案" />
              <CopyFields input={input} onChange={setInput} />
            </>
          )}

          <Divider />
          <Flex gap="small" wrap>
            {canUpdate && <Button type="primary" htmlType="submit" loading={saving}>保存变现设置</Button>}
            {!canUpdate && <Typography.Text>当前账号仅可查看变现设置。</Typography.Text>}
          </Flex>
        </Form>
      </PageStack>
    </section>
  )
}

// 新应用首次配置默认每次解锁一集、每日不限；不会从其它应用继承阈值。
function emptyInput(rewardedAdUnitCodes: string[]): ApplicationMonetizationInput {
  return {
    freeEpisodeCount: 0,
    unlockEpisodeCount: 1,
    dailyRewardLimit: 0,
    episodeUnlockAdUnitCode: rewardedAdUnitCodes[0] ?? '',
    vipStrategy: {
      enabled: false,
      forceWatchCount: 0,
      requiredAdCount: 0,
      delaySeconds: 0,
      adUnitCode: '',
      title: '',
      content: '',
      failureMessage: '',
    },
  }
}

/** CopyFields 编辑唯一一份 VIP 文案，不按应用或设备语言派生。 */
function CopyFields({ input, onChange }: { input: ApplicationMonetizationInput; onChange: (input: ApplicationMonetizationInput) => void }) {
  const copy = input.vipStrategy
  const label = '展示文案'
  const update = (field: 'title' | 'content' | 'failureMessage', value: string) => {
    onChange({ ...input, vipStrategy: { ...input.vipStrategy, [field]: value } })
  }
  return (
    <Row gutter={16} aria-label={`${label} VIP 弹窗文案`}>
      <Col xs={24} md={12}>
        <Form.Item label={`VIP 标题 · ${label}`}>
          <Input
            aria-label={`VIP 标题 · ${label}`}
            maxLength={255}
            value={copy.title}
            onChange={(event) => update('title', event.target.value)}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label={`VIP 说明 · ${label}`}>
          <Input.TextArea
            aria-label={`VIP 说明 · ${label}`}
            rows={3}
            maxLength={500}
            value={copy.content}
            onChange={(event) => update('content', event.target.value)}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label={`广告失败提示 · ${label}`}>
          <Input.TextArea
            aria-label={`广告失败提示 · ${label}`}
            rows={2}
            maxLength={500}
            value={copy.failureMessage}
            onChange={(event) => update('failureMessage', event.target.value)}
          />
        </Form.Item>
      </Col>
    </Row>
  )
}

// 把服务端配置映射为表单；旧服务端缺少新字段时使用首次配置默认值。
function toInput(config: ApplicationMonetization): ApplicationMonetizationInput {
  return {
    freeEpisodeCount: config.freeEpisodeCount ?? 0,
    unlockEpisodeCount: config.unlockEpisodeCount ?? 1,
    dailyRewardLimit: config.dailyRewardLimit ?? 0,
    episodeUnlockAdUnitCode: config.episodeUnlockAdUnitCode ?? '',
    vipStrategy: {
      enabled: config.vipStrategy?.enabled ?? false,
      // 旧投放强提示参数已停用；保存时归零，避免隐藏配置继续流转。
      forceWatchCount: 0,
      requiredAdCount: config.vipStrategy?.requiredAdCount ?? 0,
      delaySeconds: 0,
      adUnitCode: config.vipStrategy?.adUnitCode ?? '',
      title: config.vipStrategy?.title ?? '',
      content: config.vipStrategy?.content ?? '',
      failureMessage: config.vipStrategy?.failureMessage ?? '',
    },
  }
}


// 提交前校验数值与当前应用广告位；服务端 Handler 仍负责最终入口校验。
function validateInput(input: ApplicationMonetizationInput, rewardedAdUnitCodes: string[]): string {
  if (input.freeEpisodeCount < 0 || input.freeEpisodeCount > 10_000) {
    return '免费集数必须在 0 到 10000 之间'
  }
  const unlockCount = input.unlockEpisodeCount ?? 1
  const dailyLimit = input.dailyRewardLimit ?? 0
  if (!Number.isInteger(unlockCount) || unlockCount < 1 || unlockCount > 10_000) {
    return '每次广告解锁集数必须是 1 到 10000 之间的整数'
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 10_000) {
    return '每日逐集奖励上限必须是 0 到 10000 之间的整数'
  }
  const rewardedCodes = new Set(rewardedAdUnitCodes)
  if (!rewardedCodes.has(input.episodeUnlockAdUnitCode)) {
    return '请选择当前应用登记的逐集解锁激励视频广告位编码'
  }
  if (!input.vipStrategy.enabled) return ''
  if (input.vipStrategy.requiredAdCount < 1 || input.vipStrategy.requiredAdCount > 10) {
    return '获得当日 VIP 所需广告数必须在 1 到 10 之间'
  }
  if (!rewardedCodes.has(input.vipStrategy.adUnitCode)) {
    return '请选择当前应用登记的 VIP 激励视频广告位编码'
  }
  return ''
}

// 统一渲染带可访问标签的整数输入，移动端纵向排列。
function NumberField({
  id, label, value, min, max, onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <Col xs={24} md={12}>
      <Form.Item label={label} htmlFor={id}>
        <InputNumber
          id={id}
          aria-label={label}
          min={min}
          max={max}
          value={value}
          onChange={(next) => onChange(next ?? min)}
        />
      </Form.Item>
    </Col>
  )
}

function errorMessage(error: unknown): string {
  return toUserMessage(error)
}
