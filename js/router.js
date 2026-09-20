const routes = {};
let currentCleanup = null;

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

function currentPath() {
  const hash = location.hash.replace(/^#/, "");
  return hash.split("?")[0] || "/events";
}

export function currentQuery() {
  const hash = location.hash.replace(/^#/, "");
  const qIndex = hash.indexOf("?");
  return new URLSearchParams(qIndex === -1 ? "" : hash.slice(qIndex + 1));
}

// 切換路由前先呼叫上一個畫面回傳的 cleanup（取消訂閱 onAuthStateChanged、
// 關閉相機等），避免舊畫面的監聽器繼續留著、之後改到已經不存在的 DOM。
export async function renderRoute() {
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (e) {
      // 忽略 cleanup 本身的錯誤，不能讓它擋住畫面切換
    }
    currentCleanup = null;
  }

  const path = currentPath();
  const renderFn = routes[path] || routes["/events"];
  const app = document.getElementById("app");
  app.innerHTML = "";

  const cleanup = await renderFn(app);
  if (typeof cleanup === "function") currentCleanup = cleanup;

  document.querySelectorAll("[data-route]").forEach((a) => {
    const active = a.getAttribute("data-route") === path;
    a.classList.toggle("underline", active);
    a.classList.toggle("font-bold", active);
  });

  window.scrollTo(0, 0);
}
