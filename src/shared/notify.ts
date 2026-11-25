// Notify 是业务页面使用的统一结果提示端口。
export type Notify = (content: string, tone?: 'success' | 'error') => void
