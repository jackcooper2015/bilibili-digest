/* B 站字幕适配：只读取平台向当前用户提供的字幕，不下载音频。 */
var BILI_DIGEST = (() => {
  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function requestJson(url, fetcher = fetch, credentials = "include") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetcher(url, { credentials, signal: controller.signal, redirect: "error" });
      if (!response.ok) throw fail("BILIBILI_HTTP_ERROR", `B 站请求失败（HTTP ${response.status}），请稍后重试。`);
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw fail("BILIBILI_TIMEOUT", "B 站请求超时，请重试。");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function requireData(result) {
    if (result?.code === 0 && result.data) return result.data;
    if (result?.code === -101) throw fail("BILIBILI_LOGIN_REQUIRED", "请先在当前浏览器登录 B 站，再点击重试。");
    if ([-352, -412, -403].includes(result?.code)) {
      throw fail("BILIBILI_ACCESS_DENIED", "B 站暂时限制了字幕请求，请在原视频页面检查访问状态后重试。");
    }
    throw fail("BILIBILI_API_ERROR", `B 站接口返回错误（${result?.code ?? "未知"}），视频可能不可用。`);
  }

  function subtitleUrl(value) {
    const url = new URL(value, "https://www.bilibili.com");
    const allowed = ["aisubtitle.hdslb.com", "i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com", "subtitle.bilibili.com"];
    if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed.includes(url.hostname)) {
      throw fail("BILIBILI_SUBTITLE_URL", "B 站返回了暂不支持的字幕地址。");
    }
    return url.href;
  }

  function normalizeTranscript(body, language) {
    const transcript = (Array.isArray(body) ? body : [])
      .filter(row => Number.isFinite(row.from) && Number.isFinite(row.to) && row.from >= 0 && row.to > row.from && typeof row.content === "string")
      .map(row => ({ start: row.from, duration: row.to - row.from,
        text: row.content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() }))
      .filter(row => row.text).sort((a, b) => a.start - b.start);
    if (!transcript.length) throw fail("NO_TRANSCRIPT", "这个分 P 的字幕内容为空，无法生成摘要。");
    const timestamp = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    return { success: true, transcript, language, source: "bilibili",
      transcriptText: transcript.map(row => row.text).join(" "),
      transcriptTextTimestamped: transcript.map(row => `[${timestamp(row.start)}] ${row.text}`).join("\n") };
  }

  async function getVideoInfo(videoId, fetcher = fetch) {
    const video = YTD_SETTINGS.parseVideoUrl(YTD_SETTINGS.canonicalVideoUrl(videoId));
    if (video?.platform !== "bilibili") throw fail("INVALID_VIDEO", "无效的 B 站视频。");
    const query = video.video.startsWith("BV") ? `bvid=${video.video}` : `aid=${video.video.slice(2)}`;
    const data = requireData(await requestJson(`https://api.bilibili.com/x/web-interface/view?${query}`, fetcher));
    if ((video.video.startsWith("BV") && data.bvid !== video.video) ||
        (video.video.startsWith("av") && String(data.aid) !== video.video.slice(2))) {
      throw fail("BILIBILI_VIDEO_MISMATCH", "B 站返回的视频信息与当前视频不一致，请刷新页面后重试。");
    }
    const part = data.pages?.find(item => item.page === video.page);
    if (!part?.cid) throw fail("BILIBILI_PAGE_NOT_FOUND", "这个视频没有对应的分 P，请检查地址中的 p 参数。");
    return { videoId, aid: data.aid, bvid: data.bvid, cid: part.cid, page: video.page,
      title: data.pages.length > 1 ? `${data.title} · P${video.page} ${part.part}` : data.title,
      channelName: data.owner?.name || "", description: data.desc || "", duration: part.duration || 0 };
  }

  function nativePlayerUrl(info, entries) {
    // 复用页面自身的 WBI 签名，避免旧接口返回空字幕；不读取 Cookie 字符串。
    for (const entry of [...entries].reverse()) {
      try {
        const url = new URL(entry.name);
        if (url.origin !== "https://api.bilibili.com" || url.username || url.password ||
            url.pathname !== "/x/player/wbi/v2" || !url.searchParams.get("w_rid") || !url.searchParams.get("wts")) continue;
        if (url.searchParams.get("cid") !== String(info.cid)) continue;
        const aid = url.searchParams.get("aid");
        const bvid = url.searchParams.get("bvid");
        if ((!aid && !bvid) || (aid && aid !== String(info.aid)) || (bvid && bvid !== info.bvid)) continue;
        return url.href;
      } catch { /* 忽略与播放器无关的资源。 */ }
    }
    throw fail("BILIBILI_PLAYER_NOT_READY", "尚未发现当前视频的字幕请求。请等待播放器加载后重试；若仍失败，请刷新视频页面。");
  }

  async function fetchTranscript(videoId, fetcher = fetch, entries) {
    try {
      const info = await getVideoInfo(videoId, fetcher);
      const resources = entries ?? (typeof performance !== "undefined" ? performance.getEntriesByType("resource") : []);
      const data = requireData(await requestJson(nativePlayerUrl(info, resources), fetcher));
      if (data.bvid !== info.bvid || String(data.cid) !== String(info.cid)) {
        throw fail("BILIBILI_VIDEO_MISMATCH", "B 站返回的字幕索引不属于当前视频或分 P，请刷新页面后重试。");
      }
      const tracks = (data.subtitle?.subtitles || []).filter(track => track.subtitle_url);
      if (!tracks.length) {
        if (!data.login_mid || data.need_login_subtitle) {
          throw fail("BILIBILI_LOGIN_REQUIRED", "B 站没有返回可用字幕。请先在当前浏览器登录 B 站并刷新视频，再点击重试；若仍无字幕，该视频可能没有字幕轨道。");
        }
        throw fail("NO_TRANSCRIPT", "这个视频或分 P 没有可读取的字幕（画面内烧录的字幕不属于字幕轨道）。暂不支持音频转写。");
      }
      // 优先人工中文，其次自动中文，最后使用其他可用语言。
      const score = track => /^(zh|ai-zh)/i.test(track.lan) ? (/^ai-/i.test(track.lan) ? 1 : 0) : 2;
      tracks.sort((a, b) => score(a) - score(b));
      let lastError;
      for (const track of tracks) {
        try {
          const subtitle = await requestJson(subtitleUrl(track.subtitle_url), fetcher, "omit");
          return { ...normalizeTranscript(subtitle.body, track.lan), videoInfo: info,
            provenance: { version: 2, videoId, bvid: info.bvid, cid: info.cid,
              subtitleId: String(track.id_str || track.id || "") } };
        } catch (error) { lastError = error; }
      }
      throw lastError;
    } catch (error) {
      return { success: false, error: error.code || "BILIBILI_FETCH_FAILED", message: error.message || "读取 B 站字幕失败，请刷新页面后重试。" };
    }
  }
  return { getVideoInfo, fetchTranscript, normalizeTranscript, subtitleUrl, nativePlayerUrl };
})();
if (typeof module !== "undefined" && module.exports) module.exports = BILI_DIGEST;
