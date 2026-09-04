/**
 * Shared, non-secret configuration helpers.
 *
 * API keys are stored in chrome.storage.local by options.js. This file contains
 * defaults and validation only, so it is safe to publish.
 */
var YTD_SETTINGS = (() => {
  const STORAGE_KEY = "ytd_settings";
  const DEFAULTS = Object.freeze({
    provider: "deepseek",
    aiApiKey: "",
    aiBaseUrl: "https://api.deepseek.com",
    aiModel: "deepseek-v4-flash",
    supadataApiKey: "",
  });

  function isLegacyCustom(input) {
    return !!input && input.provider === "custom";
  }

  function normalize(input = {}) {
    return {
      provider: DEFAULTS.provider,
      aiApiKey: isLegacyCustom(input)
        ? ""
        : typeof input.aiApiKey === "string"
          ? input.aiApiKey.trim()
          : "",
      aiBaseUrl: DEFAULTS.aiBaseUrl,
      aiModel: DEFAULTS.aiModel,
      supadataApiKey:
        typeof input.supadataApiKey === "string"
          ? input.supadataApiKey.trim()
          : "",
    };
  }

  function migrateLegacyCustom(input = {}) {
    return {
      settings: normalize(input),
      migrated: isLegacyCustom(input),
    };
  }

  function chatCompletionsUrl() {
    return `${DEFAULTS.aiBaseUrl}/chat/completions`;
  }

  function canonicalYouTubeUrl(videoId) {
    const normalized = String(videoId || "").trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(normalized)) {
      throw new Error("Invalid YouTube video ID.");
    }
    return `https://www.youtube.com/watch?v=${normalized}`;
  }

  // B 站分 P 使用独立键；保留原有 YouTube 键，兼容已有缓存和笔记。
  function parseVideoUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      if (url.hostname === "www.youtube.com" && url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && /^[A-Za-z0-9_-]{6,20}$/.test(id)
          ? { platform: "youtube", id, url: canonicalYouTubeUrl(id) } : null;
      }
      if (url.hostname !== "www.bilibili.com") return null;
      const match = url.pathname.match(/^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10}|av[1-9]\d*)\/?$/);
      const page = Number(url.searchParams.get("p") || 1);
      if (!match || !Number.isSafeInteger(page) || page < 1) return null;
      const id = `bilibili:${match[1]}:p${page}`;
      return { platform: "bilibili", id, video: match[1], page,
        url: `https://www.bilibili.com/video/${match[1]}/?p=${page}` };
    } catch { return null; }
  }

  function canonicalVideoUrl(videoId) {
    const match = String(videoId).match(/^bilibili:(BV[1-9A-HJ-NP-Za-km-z]{10}|av[1-9]\d*):p([1-9]\d*)$/);
    if (!match) return canonicalYouTubeUrl(videoId);
    const parsed = parseVideoUrl(`https://www.bilibili.com/video/${match[1]}/?p=${match[2]}`);
    if (!parsed) throw new Error("无效的 B 站视频编号或分 P。 ");
    return parsed.url;
  }

  function timestampedVideoUrl(videoId, seconds) {
    const url = new URL(canonicalVideoUrl(videoId));
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    url.searchParams.set("t", videoId.startsWith("bilibili:") ? String(safeSeconds) : `${safeSeconds}s`);
    return url.href;
  }

  function isCompatibleDigestCache(videoId, cache) {
    if (!cache?.transcript) return false;
    if (!String(videoId).startsWith("bilibili:")) return true;
    return cache.provenance?.version === 2 && cache.provenance.videoId === videoId &&
      Number.isSafeInteger(cache.provenance.cid) && cache.provenance.cid > 0;
  }

  return {
    STORAGE_KEY,
    DEFAULTS,
    isLegacyCustom,
    normalize,
    migrateLegacyCustom,
    chatCompletionsUrl,
    canonicalYouTubeUrl,
    parseVideoUrl,
    canonicalVideoUrl,
    timestampedVideoUrl,
    isCompatibleDigestCache,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_SETTINGS;
}
