import { Card, Flex, Modal, Table, Typography, Alert } from "antd";
import type { ApplicationHomePreview } from "../../directPlayback";
/** HomePreviewDialog 呈现当前应用实际可见内容与过滤原因，用于官方应用首页检查。 */
export function HomePreviewDialog({
  preview,
  onClose,
}: {
  /** preview 只包含服务端允许读取的栏目和应用可见投影。 */
  preview?: ApplicationHomePreview;
  /** onClose 关闭预览，不修改任何首页配置。 */
  onClose: () => void;
}) {
  return (
    <Modal
      title="应用首页预览"
      open={!!preview}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {!!preview?.omittedSections?.length && (
        <Alert
          type="info"
          title="部分栏目未展示：当前账号缺少对应栏目查看权限。"
        />
      )}
      {preview && (
        <Flex vertical gap={16}>
          {[
            ["轮播", preview.carousel],
            ["热播", preview.hot],
            ...preview.rankings.map((r) => [r.name || r.tagId, r.dramas]),
          ].map(([name, values], i) => (
            <Card key={i} size="small" title={String(name)}>
              {(values as ApplicationHomePreview["carousel"]).length ? (
                <Flex gap={12} wrap>
                  {(values as ApplicationHomePreview["carousel"]).map((d) => (
                    <div key={d.id} style={{ width: 100 }}>
                      {d.coverUrl && (
                        <img
                          src={d.coverUrl}
                          alt=""
                          style={{
                            width: "100%",
                            aspectRatio: "2 / 3",
                            objectFit: "cover",
                          }}
                        />
                      )}
                      <Typography.Text>{d.title}</Typography.Text>
                    </div>
                  ))}
                </Flex>
              ) : (
                <Typography.Text type="secondary">
                  此应用暂无可展示内容
                </Typography.Text>
              )}
            </Card>
          ))}
        </Flex>
      )}
      {!!preview?.filtered?.length && (
        <Card size="small" title="未展示原因" style={{ marginTop: 16 }}>
          <Table
            size="small"
            rowKey={(r) => r.module + ":" + r.dramaId}
            dataSource={preview.filtered}
            pagination={false}
            scroll={{ x: 450 }}
            columns={[
              {
                title: "栏目",
                dataIndex: "module",
                render: (value) =>
                  value === "carousel"
                    ? "轮播"
                    : value === "hot"
                      ? "热播"
                      : "分类",
              },
              { title: "短剧", render: (_, row) => row.title || row.dramaId },
              {
                title: "原因",
                dataIndex: "reason",
                render: (value) =>
                  (
                    ({
                      application_disabled: "应用已停用",
                      hidden: "条目已隐藏",
                      offline_or_tag_changed: "已下架或标签已变更",
                      not_enabled_for_application: "未在此应用上架",
                      official_authorization_pending: "官方授权尚未生效",
                    }) as Record<string, string>
                  )[value] || "当前不可展示",
              },
            ]}
          />
        </Card>
      )}
    </Modal>
  );
}
