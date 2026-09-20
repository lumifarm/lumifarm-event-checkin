import { loginWithGoogle, logout, watchAuthState } from "./auth.js";

// 每個頁面都呼叫這個函式來初始化共用的登入/登出導覽列
export function initNavbar() {
  const loginBtn = document.getElementById("btn-login");
  const logoutBtn = document.getElementById("btn-logout");
  const userInfo = document.getElementById("nav-user-info");
  const userName = document.getElementById("nav-user-name");
  const userPhoto = document.getElementById("nav-user-photo");

  loginBtn?.addEventListener("click", async () => {
    try {
      await loginWithGoogle();
    } catch (e) {
      alert("登入失敗：" + e.message);
    }
  });

  logoutBtn?.addEventListener("click", () => logout());

  watchAuthState(
    (user) => {
      loginBtn?.classList.add("hidden");
      userInfo?.classList.remove("hidden");
      userInfo?.classList.add("flex");
      if (userName) userName.textContent = user.displayName || user.email || "";
      if (userPhoto) userPhoto.src = user.photoURL || "";
    },
    () => {
      loginBtn?.classList.remove("hidden");
      userInfo?.classList.add("hidden");
      userInfo?.classList.remove("flex");
    }
  );
}
