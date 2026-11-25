import { Checkbox, Form, Input, Modal, Select, Typography } from 'antd'
import type {
  DramaListItem,
  TikTokPublication,
  TikTokPublicationPriority,
  TikTokReviewAppealInput,
} from '../../domain'
import { reviewAppealOptions } from '../../reviewAppeals'
import { retryReviewPriority } from './publicationContent'
import type { OfficialAction } from './officialPublicationActions'

/** OfficialActionInput 只收集送审优先级或单项申诉证据，其余动作不提交可篡改的平台版本。 */
export interface OfficialActionInput {
  /** transcode 仅在同步时选择多清晰度转码，默认使用源视频。 */
  transcode?: boolean
  /** priority 仅用于首次送审和明确未受理的送审重试。 */
  priority?: TikTokPublicationPriority
  /** appeal 绑定当前版本已被拒且尚未申诉的对象。 */
  appeal?: TikTokReviewAppealInput
}
interface Props {
  /** row 标识用户明确选择的短剧和当前线上版本。 */
  row: DramaListItem
  /** publication 是点击时已核对的任务，提交前由列表再次核对。 */
  publication: TikTokPublication | null
  /** action 明确当前要执行的单一动作。 */
  action: OfficialAction
  /** busy 提交期间禁止关闭和重复确认。 */
  busy: boolean
  /** onSubmit 由列表控制权限、任务门禁和统一错误处理。 */
  onSubmit: (input: OfficialActionInput) => void
  /** onCancel 关闭未提交的确认，不改变任务。 */
  onCancel: () => void
}

/** OfficialPublicationActionDialog 只承载确认、审核优先级和申诉表单，不构造第二个发布工作台。 */
export function OfficialPublicationActionDialog({
  row,
  publication,
  action,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const [form] = Form.useForm()
  const appealOptions = reviewAppealOptions(publication)
  const description =
    action.kind === 'sync'
      ? '同步时校验并冻结当前已保存的内容；同步完成后仍需提交审核，不改变已有线上版本。'
      : action.kind === 'publish'
        ? `将上线当前已审核版本${publication?.platformVersion ? ` V${publication.platformVersion}` : ''}；完成后才切换观众看到的内容。`
        : action.kind === 'relist'
          ? `重新上架已审核的 V${row.officialRelease?.version}；沿用该版本内容，不同步当前草稿，也不重新送审。`
          : action.kind === 'offline'
          ? `将下线已选版本${row.officialRelease?.version || row.onlineVersion ? ` V${row.officialRelease?.version || row.onlineVersion}` : ''}；保留审核结果，之后可直接重新上线。请先从官方轮播和热播中移除该短剧。`
          : action.kind === 'withdraw'
            ? '撤回本次送审，已有线上版本保持不变。撤回完成后可重新同步内容。'
            : action.kind === 'review'
              ? '只提交当前已同步的内容；审核通过后仍需确认上线。'
              : action.kind === 'appeal'
                ? '只能申诉当前版本尚未申诉的被拒项目。整个版本通过后仍需确认上线。'
                : action.kind === 'retry' && publication?.stage === 'update_album' && publication.errorCode === 'external_write_uncertain'
                  ? (publication.platformVersion ?? 0) > 0
                    ? `先核对官方结果；若官方仍停在 V${publication.platformVersion}，则恢复本次冻结内容的同步。已有新版本时核对其内容，版本冲突时停止。完成后仍需手动送审。`
                    : '只查询并核对首次同步结果；保留冻结内容和已完成进度，尚未确认版本时不会重新写入。'
                : '继续当前版本未完成的步骤；保留原冻结内容和已经成功的官方处理结果。'
  return (
    <Modal
      open
      title={`${action.label} · ${row.title}`}
      styles={{ title: { paddingInlineEnd: 24 } }}
      okText={action.label}
      cancelText="取消"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      mask={{ closable: !busy }}
      keyboard={!busy}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph>{description}</Typography.Paragraph>
      {publication?.errorCode === 'urgent_review_quota_exceeded' && (
        <Typography.Paragraph>
          组织今日加急审核额度已用完；请选择普通审核重新提交，或等待额度恢复后再试。
        </Typography.Paragraph>
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        initialValues={{
          priority: publication ? retryReviewPriority(publication) : 'normal',
          transcode: false,
        }}
        onFinish={(value) => {
          if (action.kind === 'appeal') {
            const selected = appealOptions.find(
              (option) => option.value === value.itemId,
            )
            if (selected)
              onSubmit({
                appeal: {
                  itemType: selected.type,
                  itemId: selected.value,
                  reason: value.reason.trim(),
                  attachmentUrls: (value.attachments || '')
                    .split('\n')
                    .map((url: string) => url.trim())
                    .filter(Boolean),
                },
              })
          } else
            onSubmit(
              action.kind === 'review' ? { priority: value.priority } : action.kind === 'sync' ? { transcode: value.transcode === true } : {},
            )
        }}
      >
        {action.kind === 'sync' && <Form.Item name="transcode" valuePropName="checked"><Checkbox>生成多清晰度视频（转码）</Checkbox></Form.Item>}
        {action.kind === 'review' && (
          <Form.Item
            name="priority"
            label="审核优先级"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="审核优先级"
              options={[
                { value: 'normal', label: '普通审核' },
                { value: 'urgent', label: '加急审核' },
              ]}
            />
          </Form.Item>
        )}
        {action.kind === 'appeal' && (
          <>
            <Form.Item
              name="itemId"
              label="申诉对象"
              rules={[{ required: true, message: '请选择尚未申诉的被拒项目' }]}
            >
              <Select aria-label="申诉对象" options={appealOptions} />
            </Form.Item>
            <Form.Item
              name="reason"
              label="申诉理由"
              rules={[
                { required: true, whitespace: true, message: '请填写申诉理由' },
                { max: 5000 },
              ]}
            >
              <Input.TextArea
                aria-label="申诉理由"
                maxLength={5000}
                autoSize={{ minRows: 3, maxRows: 8 }}
              />
            </Form.Item>
            <Form.Item
              name="attachments"
              label="证据附件"
              extra="每行一个 HTTPS 地址，最多 10 条；每个文件不超过 200 MB。"
              rules={[
                {
                  validator: async (_, value: string = '') => {
                    const urls = value
                      .split('\n')
                      .map((url) => url.trim())
                      .filter(Boolean)
                    if (
                      urls.length > 10 ||
                      urls.some((value) => {
                        try {
                          const url = new URL(value)
                          return (
                            value.length > 2048 ||
                            url.protocol !== 'https:' ||
                            Boolean(url.username || url.password || url.hash)
                          )
                        } catch {
                          return true
                        }
                      })
                    )
                      throw new Error('请检查附件地址和数量')
                  },
                },
              ]}
            >
              <Input.TextArea
                aria-label="证据附件"
                autoSize={{ minRows: 2, maxRows: 5 }}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}
