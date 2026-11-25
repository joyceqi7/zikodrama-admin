import type { Drama } from "../../domain";
/** PublicationDifference 是运营需要确认的内容变化，不复制 VID 或播放凭据到日志。 */
export interface PublicationDifference {
  /** target 指明资料或具体集序。 */
  target: string;
  /** change 表示新增、移除或修改。 */
  change: string;
}
/** directPublicationDiff 比较当前线上版本和共享草稿，官方标识与协作资料不影响内容差异。 */
export function directPublicationDiff(
  draft: Drama,
  published?: Drama,
): PublicationDifference[] {
  const result: PublicationDifference[] = [];
  for (const [key, name] of [
    ["title", "标题"],
    ["description", "简介"],
    ["coverUrl", "封面"],
    ["tagIds", "分类标签"],
    ["status", "连载状态"],
    ["language", "语言"],
    ["year", "年份"],
  ] as const) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(published?.[key]))
      result.push({ target: name, change: published ? "修改" : "新增" });
  }
  const before = new Map(published?.episodes.map((e) => [e.id, e]) ?? []),
    after = new Map(draft.episodes.map((e) => [e.id, e]));
  for (const episode of draft.episodes) {
    const old = before.get(episode.id);
    if (!old)
      result.push({ target: `第 ${episode.number} 集`, change: "新增分集" });
    else if (
      old.vid !== episode.vid ||
      old.mediaSpaceName !== episode.mediaSpaceName
    )
      result.push({ target: `第 ${episode.number} 集`, change: "替换源媒资" });
    else if (
      old.number !== episode.number ||
      old.title !== episode.title ||
      old.description !== episode.description ||
      old.posterUrl !== episode.posterUrl ||
      old.durationSeconds !== episode.durationSeconds
    )
      result.push({
        target: `第 ${episode.number} 集`,
        change: "修改分集资料",
      });
  }
  for (const episode of published?.episodes ?? []) {
    if (!after.has(episode.id))
      result.push({ target: `原第 ${episode.number} 集`, change: "移除分集" });
  }
  return result;
}
