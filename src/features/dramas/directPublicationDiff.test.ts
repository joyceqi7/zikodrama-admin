import { expect, test } from "vitest";
import type { Drama } from "../../domain";
import { directPublicationDiff } from "./directPublicationDiff";
const source = (): Drama =>
  ({
    id: "201",
    title: "Drama",
    description: "",
    coverUrl: "cover",
    tagIds: ["21"],
    status: "completed",
    language: "en",
    year: 2026,
    episodes: [
      {
        id: "301",
        number: 1,
        title: "Episode",
        description: "",
        vid: "first",
        mediaSpaceName: "original-space",
        posterUrl: "poster",
        durationSeconds: 60,
      },
    ],
  }) as Drama;
test("草稿比较区分标签、替换媒资、增加和移除分集", () => {
  const published = source(),
    draft = source();
  draft.tagIds = ["22"];
  draft.episodes[0].mediaSpaceName = "other-space";
  draft.episodes.push({ ...draft.episodes[0], id: "302", number: 2 });
  expect(directPublicationDiff(draft, published)).toEqual([
    { target: "分类标签", change: "修改" },
    { target: "第 1 集", change: "替换源媒资" },
    { target: "第 2 集", change: "新增分集" },
  ]);
  expect(
    directPublicationDiff({ ...published, episodes: [] }, published),
  ).toEqual([{ target: "原第 1 集", change: "移除分集" }]);
});
test("官方映射和协作信息变化不制造直连草稿差异", () => {
  const before = source(),
    after = source();
  after.assignee = "different";
  after.episodes[0].platformEpisodeId = "changed";
  expect(directPublicationDiff(after, before)).toEqual([]);
});
