import { loginWithGoogle, logout, watchAuthState } from "./auth.js";
import { isCurrentUserAdmin } from "./checkin.js";

// 每個頁面都呼叫這個函式來初始化共用的登入/登出導覽列
export function initNavbar() {
  const loginBtn = document.getElementById("btn-login");
  const logoutBtn = document.getElementById("btn-logout");
  const userInfo = document.getElementById("nav-user-info");
  const userName = document.getElementById("nav-user-name");
  const userPhoto = document.getElementById("nav-user-photo");
  const checkinLink = document.getElementById("nav-link-checkin");
  const adminLink = document.getElementById("nav-link-admin");

  loginBtn?.addEventListener("click", async () => {
    try {
      await loginWithGoogle();
    } catch (e) {
      alert("登入失敗：" + e.message);
    }
  });

  logoutBtn?.addEventListener("click", () => logout());

  watchAuthState(
    async (user) => {
      loginBtn?.classList.add("hidden");
      userInfo?.classList.remove("hidden");
      userInfo?.classList.add("flex");
      if (userName) userName.textContent = user.displayName || user.email || "";
      if (userPhoto) userPhoto.src = user.photoURL || "";

      // 「報到管理」「主辦專區」只給主辦方帳號看：一般會員或還沒登入的
      // 訪客看到這兩個連結只會覺得莫名其妙，而且會誤以為自己也能操作。
      const admin = await isCurrentUserAdmin();
      checkinLink?.classList.toggle("hidden", !admin);
      adminLink?.classList.toggle("hidden", !admin);
    },
    () => {
      loginBtn?.classList.remove("hidden");
      userInfo?.classList.add("hidden");
      userInfo?.classList.remove("flex");
      checkinLink?.classList.add("hidden");
      adminLink?.classList.add("hidden");
    }
  );
}
