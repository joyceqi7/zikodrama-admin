import { ConfigProvider } from "antd";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { HomePreviewDialog } from "./HomePreviewDialog";
test("首页预览显示真实空栏目、过滤原因和缺少权限提示", async () => {
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <HomePreviewDialog
        onClose={vi.fn()}
        preview={{
          carousel: [],
          hot: [],
          rankings: [],
          omittedSections: ["hot"],
          filtered: [
            {
              module: "carousel",
              dramaId: "201",
              title: "Unavailable",
              reason: "not_enabled_for_application",
            },
          ],
        }}
      />
    </ConfigProvider>,
  );
  await screen.findByRole("dialog", { name: "应用首页预览" });
  expect(screen.getByText("未在此应用上架")).toBeInTheDocument();
  expect(
    screen.getByText("部分栏目未展示：当前账号缺少对应栏目查看权限。"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("此应用暂无可展示内容")).toHaveLength(2);
});
