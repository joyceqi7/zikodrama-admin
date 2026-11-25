import type { ReactNode } from 'react'
import { Modal as AntModal } from 'antd'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  width?: 'compact' | 'wide'
}

export function Modal({ title, children, onClose, width = 'compact' }: ModalProps) {
  return (
    <AntModal open title={title} onCancel={onClose} footer={null} width={width === 'wide' ? 760 : 520} destroyOnHidden aria-label={title}>
      {children}
    </AntModal>
  )
}

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
	cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = '删除', cancelLabel = '取消', busy, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <AntModal
      open
      title={title}
      onCancel={onClose}
      onOk={onConfirm}
      okText={confirmLabel}
	  cancelText={cancelLabel}
      confirmLoading={busy}
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      <p>{message}</p>
    </AntModal>
  )
}
