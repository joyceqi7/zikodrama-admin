import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Tooltip, Typography } from 'antd'
import type { OperationsApi } from '../../api'
import { reportOperationFailure } from '../../operationErrors'
import { UserFacingError } from '../../userMessage'

interface CopyCampaignLinkButtonProps {
  /** api 只向服务端请求官方链接，前端不拼接落地地址。 */
  api: OperationsApi
  /** dramaId 是列表中的业务短剧标识。 */
  dramaId: string
  /** applicationId 固定为点击时右上角选中的内部应用标识。 */
  applicationId: string
  /** online 表示列表存在已上线版本；当前 Mini 的实际播放通道和授权由服务端再次校验。 */
  online: boolean
  /** notify 展示复制结果及统一错误提示。 */
  notify(message: string, tone?: 'success' | 'error'): void
}

/** CopyCampaignLinkButton 一次点击复用或生成第一集链接并复制；父级按应用标识重建以隔离迟到结果。 */
export function CopyCampaignLinkButton({ api, dramaId, applicationId, online, notify }: CopyCampaignLinkButtonProps) {
  const [busy, setBusy] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const copy = async () => {
    if (pending.current || !applicationId || !online) return
    pending.current = true
    setBusy(true)
    let operation = '获取投放链接失败'
    let resolvedUrl = ''
    try {
      const link = (manualUrl ? Promise.resolve({ landingUrl: manualUrl }) : api.ensureDramaCampaign(dramaId, applicationId)).then(item => {
        if (!mounted.current) throw new UserFacingError('当前小程序已切换，已取消复制')
        if (!item.landingUrl) throw new UserFacingError('暂未取得投放链接，请重试')
        resolvedUrl = item.landingUrl
        return item.landingUrl
      })
      // 在用户点击期间发起剪贴板写入，允许 Safari 等浏览器等待异步生成链接。
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const content = link.then(url => new Blob([url], { type: 'text/plain' }))
        const writing = (async () => navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]))()
        void content.catch(() => { /* 链接错误由下方 settled 结果统一记录。 */ })
        const [resolved, copied] = await Promise.allSettled([link, writing])
        if (resolved.status === 'rejected') throw resolved.reason
        operation = '复制投放链接失败'
        if (copied.status === 'rejected') throw copied.reason
      } else {
        const url = await link
        operation = '复制投放链接失败'
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
        else if (!copyWithSelection(url)) throw new UserFacingError('浏览器未允许自动复制，请手动复制下方链接')
      }
      if (mounted.current) { setManualUrl(''); notify('投放链接已复制') }
    } catch (error) {
      const message = reportOperationFailure(operation, error)
      if (mounted.current) {
        if (resolvedUrl) {
          // 自动复制失败仍保留官方结果，重试不再生成链接。
          if (navigator.clipboard && copyWithSelection(resolvedUrl)) {
            setManualUrl('')
            notify('投放链接已复制')
          } else {
            setManualUrl(resolvedUrl)
            notify('自动复制未完成，链接已就绪，可手动复制', 'error')
          }
        } else notify(message, 'error')
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return <><Tooltip title={!applicationId ? '请先在右上角选择小程序' : !online ? '短剧上线后可复制投放链接' : undefined}>
    <Button size="small" loading={busy} disabled={!applicationId || !online} onClick={() => void copy()}>复制投放链接</Button>
  </Tooltip>
    <Modal title="复制投放链接" open={Boolean(manualUrl)} onCancel={() => setManualUrl('')} footer={<Button onClick={() => void copy()} loading={busy}>再次复制</Button>}>
      <Typography.Paragraph>浏览器未允许自动复制。请选择下方完整链接，使用系统复制操作。</Typography.Paragraph>
      <Input.TextArea aria-label="投放链接" value={manualUrl} readOnly autoSize={{ minRows: 2, maxRows: 5 }} onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} />
    </Modal>
  </>
}

/** copyWithSelection 为不提供 Clipboard API 的浏览器尝试兼容复制，结束后恢复原焦点。 */
function copyWithSelection(url: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const previous = document.activeElement as HTMLElement | null
  const field = document.createElement('textarea')
  field.value = url
  field.readOnly = true
  field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'
  document.body.append(field)
  try {
    field.focus()
    field.select()
    const copied = document.execCommand('copy')
    if (!copied) console.warn('兼容复制投放链接失败', { error: 'Browser rejected copy command' })
    return copied
  } catch (error) {
    reportOperationFailure('兼容复制投放链接失败', error)
    return false
  } finally {
    field.remove()
    previous?.focus()
  }
}
