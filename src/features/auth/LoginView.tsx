import { Alert, Button, Flex, Form, Input, Layout, Typography } from 'antd'
import { Clapperboard, ShieldCheck } from 'lucide-react'

interface LoginViewProps {
  busy: boolean
  error: string
  onLogin: (username: string, password: string) => Promise<void>
}

export function LoginView({ busy, error, onLogin }: LoginViewProps) {
  return (
    <Layout className="login-shell">
      <main className="login-main">
        <section className="login-brand" aria-label="短剧运营控制台">
          <div className="login-brand-mark" aria-hidden="true">
            <Clapperboard size={20} strokeWidth={1.8} />
          </div>
          <Typography.Text className="login-eyebrow">DRAMA / OPERATIONS</Typography.Text>
          <Typography.Title className="login-product-name" level={1}>短剧运营控制台</Typography.Title>
          <Typography.Paragraph className="login-product-description">
            管理共享短剧内容、应用变现与 TikTok 投放配置。
          </Typography.Paragraph>
          <div className="login-trust-note">
            <ShieldCheck size={18} strokeWidth={1.9} />
            <span>安全工作区</span>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-form-wrap">
            <Flex vertical gap={8}>
              <Typography.Title id="login-title" className="login-form-title" level={3}>Drama 短剧后台管理系统</Typography.Title>
              <Typography.Text type="secondary">请输入账号密码登录</Typography.Text>
            </Flex>
            {error && <Alert className="login-error" type="error" showIcon title={error} role="alert" />}
            <Form
              className="login-form"
              layout="vertical"
              initialValues={{ username: 'admin', password: '' }}
              onFinish={({ username, password }: { username: string, password: string }) => onLogin(username, password)}
            >
              <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input aria-label="用户名" placeholder="输入后台账号" autoComplete="username" />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password aria-label="密码" placeholder="输入密码" autoComplete="current-password" autoFocus />
              </Form.Item>
              <Button block size="large" type="primary" htmlType="submit" loading={busy}>
                进入控制台
              </Button>
            </Form>
          </div>
        </section>
      </main>
    </Layout>
  )
}
