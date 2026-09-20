// 活動標籤的固定分類清單：只有這裡改，新增/修改分類時不用動其他檔案。
export const EVENT_TAGS = [
  { id: "food-education", label: "食農教育", icon: "🌾", badgeClass: "badge-tag-amber" },
  { id: "wellbeing", label: "身心平衡", icon: "🧘", badgeClass: "badge-tag-purple" },
  { id: "field-experience", label: "田間體驗", icon: "🌱", badgeClass: "badge-tag-green" },
  { id: "coop-economy", label: "合作經濟", icon: "🤝", badgeClass: "badge-tag-blue" },
  { id: "guided-tour", label: "走讀導覽", icon: "🚶", badgeClass: "badge-tag-teal" },
];

export function getTagInfo(id) {
  return EVENT_TAGS.find((t) => t.id === id);
}

// 標籤是固定分類（不是使用者能自由輸入的文字），用 innerHTML 拼字串沒有風險
export function renderTagBadgesHtml(tagIds) {
  if (!tagIds || tagIds.length === 0) return "";
  return tagIds
    .map((id) => getTagInfo(id))
    .filter(Boolean)
    .map((tag) => `<span class="badge ${tag.badgeClass}">${tag.icon} ${tag.label}</span>`)
    .join("");
}
