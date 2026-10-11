// 同行孩童的輸入表單：會員報名視窗跟主辦專區「報名名單」補登孩童共用。
// 全部用 createElement 組，不用 innerHTML，輸入的姓名不會被當成 HTML。
import { MAX_COMPANIONS, normalizeCompanion, validateCompanion } from "./companions.js";

function field(labelText, input) {
  const wrap = document.createElement("label");
  wrap.className = "block text-xs text-gray-600";
  wrap.textContent = labelText;
  input.className = "w-full border rounded-lg p-2 text-sm mt-1";
  wrap.appendChild(input);
  return wrap;
}

// 在 root 裡建立可新增／刪除的孩童清單，回傳 { getValues, count }
export function createCompanionEditor(root, { initial = [], max = MAX_COMPANIONS, onChange = () => {} } = {}) {
  const list = document.createElement("div");
  list.className = "space-y-3";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "text-sm text-emerald-700 underline";
  addBtn.textContent = "＋ 新增一位孩童";
  root.append(list, addBtn);

  const rows = [];

  function refresh() {
    rows.forEach((r, i) => (r.title.textContent = `孩童 ${i + 1}`));
    addBtn.classList.toggle("hidden", rows.length >= max);
    onChange(rows.length);
  }

  function addRow(c = {}) {
    const box = document.createElement("div");
    box.className = "border rounded-lg p-3 bg-white space-y-2";
    const head = document.createElement("div");
    head.className = "flex items-center justify-between";
    const title = document.createElement("span");
    title.className = "text-sm font-bold text-gray-700";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "text-xs text-red-600 underline";
    removeBtn.textContent = "移除";
    head.append(title, removeBtn);

    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "真實姓名";
    name.value = c.name || "";
    const nationalId = document.createElement("input");
    nationalId.type = "text";
    nationalId.placeholder = "例如 A123456789";
    nationalId.value = c.nationalId || "";
    const birthDate = document.createElement("input");
    birthDate.type = "date";
    birthDate.value = c.birthDate || "";

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 sm:grid-cols-3 gap-2";
    grid.append(field("真實姓名", name), field("身分證字號", nationalId), field("出生年月日", birthDate));
    box.append(head, grid);
    list.appendChild(box);

    const row = { box, title, name, nationalId, birthDate };
    rows.push(row);
    removeBtn.addEventListener("click", () => {
      box.remove();
      rows.splice(rows.indexOf(row), 1);
      refresh();
    });
    refresh();
  }

  addBtn.addEventListener("click", () => addRow());
  initial.forEach((c) => addRow(c));
  refresh();

  return {
    getValues: () =>
      rows.map((r) =>
        normalizeCompanion({ name: r.name.value, nationalId: r.nationalId.value, birthDate: r.birthDate.value })
      ),
    count: () => rows.length,
    addRow,
  };
}

// 檢查整份孩童清單，回傳第一個錯誤訊息或 null
export function validateCompanions(list, eventDate, opts) {
  for (const c of list) {
    const err = validateCompanion(c, eventDate, opts);
    if (err) return err;
  }
  const ids = list.map((c) => c.nationalId).filter(Boolean);
  if (new Set(ids).size !== ids.length) return "孩童的身分證字號重複了，請確認";
  return null;
}

// 主辦專區補登／修改某張票券的同行孩童用的小視窗
export function showCompanionsModal({ title, note, initial, max, eventDate, onSave }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";
  const box = document.createElement("div");
  box.className = "card rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto space-y-3";

  const h = document.createElement("h2");
  h.className = "text-lg font-bold text-gray-800";
  h.textContent = title;
  const p = document.createElement("p");
  p.className = "text-xs text-gray-500 whitespace-pre-wrap";
  p.textContent = note;
  const editorRoot = document.createElement("div");
  box.append(h, p, editorRoot);
  const editor = createCompanionEditor(editorRoot, { initial, max });

  const btnRow = document.createElement("div");
  btnRow.className = "flex gap-3 justify-end pt-2";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "text-sm text-gray-500 underline";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-primary text-sm";
  saveBtn.textContent = "儲存";
  saveBtn.addEventListener("click", async () => {
    const values = editor.getValues();
    const err = validateCompanions(values, eventDate, { requireAll: false });
    if (err) {
      alert(err);
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "儲存中...";
    try {
      await onSave(values);
      overlay.remove();
    } catch (e) {
      alert("儲存失敗：" + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "儲存";
    }
  });
  btnRow.append(cancelBtn, saveBtn);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
