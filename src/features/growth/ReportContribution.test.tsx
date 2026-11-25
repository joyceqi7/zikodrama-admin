import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ReportAdShowSummary } from './ReportContribution'

test('展示次数按激励及插屏拆分，注明应用范围而非剧目链接归因', () => {
 render(<ReportAdShowSummary shows={{ total: 17, rewarded: 12, interstitial: 5, complete: true, availableFrom: '2026-07-09' }} />)
 expect(screen.getByText('总展示次数')).toBeInTheDocument()
 expect(screen.getByText('17')).toBeInTheDocument()
 expect(screen.getByText('12')).toBeInTheDocument()
 expect(screen.getByText('5')).toBeInTheDocument()
 expect(screen.getByText(/不受剧名或投放链接搜索影响/)).toBeInTheDocument()
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('过期历史展示记录不能将部分统计表现为完整统计', () => {
 render(<ReportAdShowSummary shows={{ total: 0, rewarded: 0, interstitial: 0, complete: false, availableFrom: '2026-07-09' }} />)
 expect(screen.getByRole('alert')).toHaveTextContent('部分日期埋点已过期')
 expect(screen.getByRole('alert')).toHaveTextContent('2026-07-09')
})
