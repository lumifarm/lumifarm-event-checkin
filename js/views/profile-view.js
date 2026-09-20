import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getMyProfile, updateMyProfile, validateProfileFields } from "../profile.js";

export function renderProfile(container) {
  container.innerHTML = `
    <div class="max-w-md mx-auto">
      <p id="profile-login-prompt" class="hidden text-center text-gray-500 py-16">請先使用 Google 登入以維護個人資料。</p>
      <div id="profile-section" class="hidden">
        <h1 class="text-2xl font-bold text-gray-800 my-4">🪴 資料維護</h1>
        <p class="text-sm text-gray-600 mb-4">
          活動需要幫參加者辦理保險，報名前請先填寫以下真實資料。這些資料只有你自己和主辦方看得到，之後可以隨時回來這裡修改。
        </p>
        <form id="profile-form" class="card rounded-xl p-5 space-y-3">
          <div>
            <label class="text-sm text-gray-600 block mb-1">真實姓名</label>
            <input id="pf-realname" type="text" required class="w-full border rounded-lg p-2" />
          </div>
          <div>
            <label class="text-sm text-gray-600 block mb-1">身分證字號</label>
            <input id="pf-nationalid" type="text" required maxlength="10" placeholder="A123456789" class="w-full border rounded-lg p-2" />
          </div>
          <div>
            <label class="text-sm text-gray-600 block mb-1">出生年月日</label>
            <input id="pf-birthdate" type="date" required class="w-full border rounded-lg p-2" />
          </div>
          <button type="submit" id="profile-submit" class="btn-primary w-full">儲存</button>
          <p id="profile-saved-msg" class="hidden text-sm text-emerald-700 text-center">已儲存！</p>
        </form>
      </div>
    </div>`;

  const loginPrompt = container.querySelector("#profile-login-prompt");
  const section = container.querySelector("#profile-section");
  const form = container.querySelector("#profile-form");
  const realNameInput = container.querySelector("#pf-realname");
  const nationalIdInput = container.querySelector("#pf-nationalid");
  const birthDateInput = container.querySelector("#pf-birthdate");
  const submitBtn = container.querySelector("#profile-submit");
  const savedMsg = container.querySelector("#profile-saved-msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    savedMsg.classList.add("hidden");
    const fields = {
      realName: realNameInput.value,
      nationalId: nationalIdInput.value,
      birthDate: birthDateInput.value,
    };
    const error = validateProfileFields(fields);
    if (error) {
      alert(error);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "儲存中...";
    try {
      await updateMyProfile(fields);
      savedMsg.classList.remove("hidden");
    } catch (err) {
      alert("儲存失敗：" + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "儲存";
    }
  });

  async function render(user) {
    if (!user) {
      loginPrompt.classList.remove("hidden");
      section.classList.add("hidden");
      return;
    }
    loginPrompt.classList.add("hidden");
    section.classList.remove("hidden");

    const profile = await getMyProfile();
    realNameInput.value = profile?.realName || "";
    nationalIdInput.value = profile?.nationalId || "";
    birthDateInput.value = profile?.birthDate || "";
  }

  const unsubscribe = onAuthStateChanged(auth, render);
  return () => unsubscribe();
}
