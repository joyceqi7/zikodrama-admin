import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { DramaListItem } from '../../domain'
import { CatalogActionDialog } from './CatalogActionDialog'

test('列表送审重试默认普通审核并允许改选加急，原任务保留', async () => {
 const retry = vi.fn(async () => ({}))
 const api = { retryTikTokPublication: retry } as unknown as OperationsApi
 const drama = { id: '170', title: '测试短剧', publication: { status: 'failed', stage: 'submit_review', priority: 'urgent', errorCode: 'urgent_review_quota_exceeded' } } as DramaListItem
 render(<CatalogActionDialog api={api} drama={drama} action="retry" onClose={() => {}} onChanged={() => {}} />)
 expect(screen.getByLabelText('审核优先级').closest('.ant-select')).toHaveTextContent('普通审核')
 fireEvent.mouseDown(screen.getByLabelText('审核优先级'))
 fireEvent.click(await screen.findByText('加急审核', { selector: '.ant-select-item-option-content' }))
 expect(screen.getByLabelText('审核优先级').closest('.ant-select')).toHaveTextContent('加急审核')
 fireEvent.click(screen.getByRole('button', { name: /确认/ }))
 await waitFor(() => expect(retry).toHaveBeenCalledWith('170', { priority: 'urgent' }))
})
