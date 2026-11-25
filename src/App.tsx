import { useMemo } from 'react'
import { ConfigProvider, Result } from 'antd'
import { HttpOperationsApi, type OperationsApi } from './api'
import type { DirectMediaUploader } from './media/byteplusUploader'
import { currentRuntimeConfig, type RuntimeConfig } from './runtimeConfig'
import { toUserMessage } from './userMessage'
import { consoleTheme } from './app/theme'
import { OperationsConsole, type OperationsConsoleProps } from './app/OperationsConsole'

interface AppProps {
  // api 可注入测试或已配置的接口实例。
  api?: OperationsApi
  // directUploader 可注入直传实现。
  directUploader?: DirectMediaUploader
}

// App 只读取运行配置并装配后台入口。
export default function App({ api, directUploader }: AppProps) {
  if (api) return <OperationsConsole api={api} directUploader={directUploader} />
  try {
    return <RuntimeConfiguredConsole runtimeConfig={currentRuntimeConfig()} directUploader={directUploader} />
  } catch (error) {
    return (
      <ConfigProvider theme={consoleTheme}>
        <Result
          status="error"
          title="后台部署配置无效"
          subTitle={toUserMessage(error, '无法读取后台运行时配置。')}
        />
      </ConfigProvider>
    )
  }
}

function RuntimeConfiguredConsole({ runtimeConfig, directUploader }: Pick<OperationsConsoleProps, 'directUploader'> & { runtimeConfig: RuntimeConfig }) {
  const api = useMemo(
    () => new HttpOperationsApi(runtimeConfig.apiBaseUrl, fetch, sessionStorage, runtimeConfig.storageNamespace),
    [runtimeConfig.apiBaseUrl, runtimeConfig.storageNamespace],
  )
  return <OperationsConsole api={api} directUploader={directUploader} />
}
