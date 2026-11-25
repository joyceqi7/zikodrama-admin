import { Empty, Form, Modal, Spin } from 'antd'
import { useEffect, useId, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import { toApplicationInput } from '../../applicationInput'
import { applicationAdUnitFormValue, toApplicationAdUnits, type ApplicationAdUnitFormValue } from '../../applicationAdUnits'
import { reportOperationFailure } from '../../operationErrors'
import { ApplicationAdUnitFields } from '../applications/ApplicationAdUnitFields'

interface Props {
  // api 复用应用更新接口，服务端继续校验应用编辑权限、广告位及解锁策略约束。
  api: OperationsApi
  // application 是应用管理列表中明确选择的记录；以应用 ID 作为 key 隔离草稿。
  application?: Application
  /** onClose 关闭应用列表内的广告位弹窗。 */
  onClose?(): void
  // loading 表示当前应用目录尚未加载完成。
  loading: boolean
  // canUpdate 控制广告配置保存和编辑能力。
  canUpdate: boolean
  // onChanged 将保存结果更新到全局应用目录。
  onChanged(application: Application): void
  // onDraftChange 让外壳在切换页面或应用前保护未保存草稿。
  onDraftChange?(dirty: boolean, saving: boolean): void
  // notify 展示经过统一映射的操作反馈。
  notify(message: string, tone?: 'success' | 'error'): void
}

/** AdConfiguration 在应用列表中以独立弹窗配置所选应用的广告位。 */
export function AdConfiguration({ api, application, loading, canUpdate, onChanged, onDraftChange, onClose, notify }: Props) {
  const [form] = Form.useForm<ApplicationAdUnitFormValue>()
  const formId = useId()
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  useEffect(() => {
    onDraftChange?.(dirty, saving)
  }, [dirty, saving, onDraftChange])
  useEffect(() => () => onDraftChange?.(false, false), [onDraftChange])

  useEffect(() => {
    if (!dirty && !saving) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, saving])

  const save = async (value: ApplicationAdUnitFormValue) => {
    if (!application || !canUpdate || saving) return
    setSaving(true)
    try {
      const saved = await api.updateApplication(application.id, { ...toApplicationInput(application), adUnits: toApplicationAdUnits(value) })
      form.setFieldsValue(applicationAdUnitFormValue(saved.adUnits))
      onChanged(saved)
      setDirty(false)
      notify('广告位已保存')
      onClose?.()
    } catch (error) {
      notify(reportOperationFailure('save application ad units failed', error), 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <Spin aria-label="正在加载广告配置" />
  if (!application) return <Empty description="请先在顶部选择应用，再配置广告位" />

  const requestClose = () => {
    if (saving) return
    if (dirty) setDiscardOpen(true)
    else onClose?.()
  }

  return <>
    <Modal
      open
      centered
      title={`广告位 · ${application.name}`}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      onCancel={requestClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      closable={!saving}
      keyboard={!saving}
      mask={{ closable: !saving }}
      okButtonProps={{ htmlType: 'submit', form: formId, disabled: !canUpdate }}
      cancelButtonProps={{ disabled: saving }}
    >
      <Form
        id={formId}
        form={form}
        layout="vertical"
        disabled={!canUpdate || saving}
        initialValues={applicationAdUnitFormValue(application.adUnits)}
        scrollToFirstError={{ focus: true }}
        onValuesChange={() => setDirty(true)}
        onFinish={value => void save(value)}
      >
        <ApplicationAdUnitFields required={application.status === 'active' && application.monetizationMode !== 'IAP'} disabled={!canUpdate || saving} previousInterstitial={application.adUnits.interstitial} />
      </Form>
    </Modal>
    <Modal title="放弃广告位的修改？" open={discardOpen} okText="放弃修改" cancelText="继续编辑" okButtonProps={{ danger: true }} onCancel={() => setDiscardOpen(false)} onOk={() => { setDiscardOpen(false); onClose?.() }}>尚未保存的广告位配置将丢失。</Modal>
  </>
}
