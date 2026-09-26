import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 活動標籤存在 Firestore 的 eventTags collection，主辦方可以在主辦專區自己新增、
// 編輯、刪除。這份預設清單只在 collection 還是空的時候使用，並會在主辦方第一次
// 打開主辦專區時寫進 Firestore；id 沿用舊版寫死在程式裡的 id，舊活動上已經
// 存的標籤才不會對不起來。
const DEFAULT_TAGS = [
  { id: "food-education", label: "食農教育", icon: "🌾", color: "amber", order: 1 },
  { id: "wellbeing", label: "身心平衡", icon: "🧘", color: "purple", order: 2 },
  { id: "field-experience", label: "田間體驗", icon: "🌱", color: "green", order: 3 },
  { id: "coop-economy", label: "合作經濟", icon: "🤝", color: "blue", order: 4 },
  { id: "guided-tour", label: "走讀導覽", icon: "🚶", color: "teal", order: 5 },
  { id: "labor-exchange", label: "換工活動", icon: "🧑‍🌾", color: "lime", order: 6 },
];

// 換工點數、出席折扣券的計算都認這個 id，所以可以改名稱/圖示/顏色，但不能刪。
export const LABOR_EXCHANGE_TAG_ID = "labor-exchange";

export const TAG_COLORS = ["green", "lime", "teal", "blue", "purple", "pink", "amber", "orange", "gray"];

export const TAG_ICON_CHOICES = [
  "🌳", "🌲", "🌱", "🌿", "🍃", "🪴", "🌾", "🌻", "🌼", "🌸", "🍂", "🍄",
  "🥕", "🍅", "🥬", "🍎", "🍞", "🍳", "🍵", "☕", "🐝", "🦋", "🐓", "💧",
  "☀️", "🌈", "🔥", "⛰️", "🏕️", "🥾", "🚶", "🧘", "🙏", "🤝", "👥", "🧑‍🌾",
  "📚", "✏️", "🎨", "🎵", "💻", "📱", "📍", "🏠", "🗺️", "🚌", "🎁", "💬",
];

let cachedTags = DEFAULT_TAGS;

function sortTags(tags) {
  return [...tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "zh-Hant"));
}

// 讀取失敗（例如 Firestore 規則還沒更新）時沿用上一次的清單，不能讓整個活動列表
// 因為標籤讀不到而整頁壞掉。
export async function loadTags() {
  try {
    const snap = await getDocs(collection(db, "eventTags"));
    cachedTags = snap.empty ? DEFAULT_TAGS : sortTags(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (e) {
    console.warn("讀取活動標籤失敗，先使用預設標籤：", e);
  }
  return cachedTags;
}

export function getTags() {
  return cachedTags;
}

export function getTagInfo(id) {
  return cachedTags.find((t) => t.id === id);
}

// 標籤只有主辦方能新增/修改（Firestore 規則把關），用 innerHTML 拼字串沒有風險，
// 跟活動標題、說明一樣。刪掉的標籤在舊活動上會直接不顯示。
export function renderTagBadgesHtml(tagIds) {
  if (!tagIds || tagIds.length === 0) return "";
  return tagIds
    .map((id) => getTagInfo(id))
    .filter(Boolean)
    .map((tag) => tagBadgeHtml(tag))
    .join("");
}

export function tagBadgeHtml(tag) {
  return `<span class="badge badge-tag-${tag.color || "gray"}">${tag.icon || ""} ${tag.label}</span>`;
}

// 以下只有主辦方能呼叫成功（規則：eventTags 只有 isAdmin() 能寫）。
export async function ensureDefaultTagsSeeded() {
  const snap = await getDocs(collection(db, "eventTags"));
  if (!snap.empty) return;
  const batch = writeBatch(db);
  DEFAULT_TAGS.forEach(({ id, ...data }) => batch.set(doc(db, "eventTags", id), data));
  await batch.commit();
}

export async function createTag({ label, icon, color }) {
  await addDoc(collection(db, "eventTags"), { label, icon, color, order: Date.now() });
}

export async function updateTag(id, { label, icon, color }) {
  await updateDoc(doc(db, "eventTags", id), { label, icon, color });
}

export async function deleteTag(id) {
  if (id === LABOR_EXCHANGE_TAG_ID) throw new Error("「換工活動」標籤跟換工點數綁在一起，不能刪除");
  await deleteDoc(doc(db, "eventTags", id));
}
