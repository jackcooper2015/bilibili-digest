/* B 站页面交互与登录态下的字幕请求。与 YouTube 内容脚本分别加载。 */
(() => {
  const videoRef = () => YTD_SETTINGS.parseVideoUrl(location.href);
  const player = () => document.querySelector(".bpx-player-video-wrap video, .bilibili-player-video video, video");
  const info = () => ({
    videoId: videoRef()?.id,
    title: document.querySelector("h1.video-title, h1")?.textContent?.trim() || "",
    channelName: document.querySelector(".up-name, .up-detail .name")?.textContent?.trim() || "",
    description: document.querySelector(".basic-desc-info, #v_desc .info")?.textContent?.trim() || "",
    duration: Number.isFinite(player()?.duration) ? player().duration : 0,
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.videoId && message.videoId !== videoRef()?.id) {
      respond({ success: false, error: "VIDEO_CHANGED", message: "视频已切换，请重新打开摘要。" });
      return false;
    }
    switch (message.action) {
      case "getVideoInfo": respond(info()); return false;
      case "getCurrentTime": respond({ currentTime: Math.floor(player()?.currentTime || 0), paused: player()?.paused ?? true }); return false;
      case "fetchBilibiliTranscript":
        BILI_DIGEST.fetchTranscript(videoRef()?.id).then(respond);
        return true;
      case "seekTo": {
        const element = player();
        const seconds = Number(message.seconds);
        if (!element || !Number.isFinite(seconds) || seconds < 0) {
          respond({ success: false, error: "播放器尚未就绪。" }); return false;
        }
        element.currentTime = seconds;
        element.play().catch(() => {});
        respond({ success: true }); return false;
      }
      case "highlightMoments": case "showNoteSavedFeedback": respond({ success: true }); return false;
      default: return false;
    }
  });

  function makeButton(id, label, action) {
    const button = document.createElement("button");
    button.id = id; button.type = "button"; button.textContent = label;
    button.style.cssText = "border:0;border-radius:20px;padding:9px 16px;margin:0 6px;background:#c8674f;color:#fff;font:600 13px system-ui;cursor:pointer;white-space:nowrap";
    button.addEventListener("click", action);
    return button;
  }
  function reconcile() {
    if (!videoRef()) {
      document.getElementById("bili-digest-actions")?.remove();
      return;
    }
    if (document.getElementById("bili-digest-actions")) return;
    const host = document.querySelector("#arc_toolbar_report, .video-toolbar-container");
    if (!host) return;
    const actions = document.createElement("div");
    actions.id = "bili-digest-actions";
    actions.style.cssText = "display:flex;align-items:center;flex-shrink:0";
    actions.append(makeButton("bili-digest-button", "视频摘要", () => {
      chrome.runtime.sendMessage({ action: "openSidePanel" }).catch(() => {});
    }));
    const noteButton = makeButton("bili-note-button", "记笔记", async () => {
      const current = info();
      if (!current.videoId || !player()) return;
      noteButton.disabled = true; noteButton.textContent = "保存中…";
      try {
        const result = await chrome.runtime.sendMessage({ action: "saveNote", ...current,
          videoTitle: current.title, timestamp: Math.max(0, Math.floor(player().currentTime) - 3) });
        noteButton.textContent = result.success ? "已保存" : "保存失败";
        noteButton.title = result.error || "";
      } catch { noteButton.textContent = "请刷新页面"; }
      finally { noteButton.disabled = false; setTimeout(() => { noteButton.textContent = "记笔记"; }, 2500); }
    });
    actions.append(noteButton);
    host.append(actions);
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; reconcile(); }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", reconcile);
  reconcile();
})();
