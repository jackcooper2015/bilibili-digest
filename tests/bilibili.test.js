const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const settings = require("../settings.js");
const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, YTD_SETTINGS: settings, performance: { getEntriesByType: () => [{ name: "https://api.bilibili.com/x/player/wbi/v2?aid=123&cid=200&w_rid=test-signature&wts=1788527613" }] } });
vm.runInContext(fs.readFileSync(require.resolve("../bilibili.js"), "utf8"), context);
const bili = context.BILI_DIGEST;
const id = "bilibili:BV1SR5v6pE8M:p2";

test("旧接口无字幕时，复用播放器同一 CID 的签名接口读取课程字幕", async () => {
  const nativeUrl = "https://api.bilibili.com/x/player/wbi/v2?aid=123&cid=200&w_rid=test-signature&wts=1788527613";
  const calls = [];
  const { fetcher } = fixture();
  const result = await bili.fetchTranscript(id, async (url, options) => {
    calls.push(url);
    if (url.includes("/player/v2?")) return { ok: true, json: async () => ({ code: 0, data: { login_mid: 1, subtitle: { subtitles: [] } } }) };
    if (url === nativeUrl) return { ok: true, json: async () => ({ code: 0, data: { bvid: "BV1SR5v6pE8M", cid: 200, login_mid: 1, subtitle: { subtitles: [{ id_str: "1234567890123456789", lan: "ai-zh", subtitle_url: "https://aisubtitle.hdslb.com/course.json" }] } } }) };
    return fetcher(url, options);
  }, [{ name: nativeUrl }]);
  assert.equal(result.success, true, "播放器可读取的课程字幕不应被旧接口的空数组挡住");
  assert.ok(calls.includes(nativeUrl));
  assert.ok(!calls.some(url => url.includes("/player/v2?")));
  assert.equal(result.provenance.subtitleId, "1234567890123456789");
});

test("只使用同一视频和 CID 的原生请求，不借用推荐视频、旧分 P 或未知域名", () => {
  const info = { aid: 123, bvid: "BV1SR5v6pE8M", cid: 200 };
  const good = "https://api.bilibili.com/x/player/wbi/v2?aid=123&cid=200&w_rid=test&wts=1";
  for (const name of [good.replace("cid=200", "cid=100"), good.replace("aid=123", "aid=999"), good.replace("api.bilibili.com", "evil.test"), good.replace("/wbi/v2", "/v2"), good.replace("&w_rid=test", "")]) {
    assert.throws(() => bili.nativePlayerUrl(info, [{ name }]), /尚未发现/);
  }
  assert.equal(bili.nativePlayerUrl(info, [{ name: good }, { name: good.replace("cid=200", "cid=999") }]), good);
});

test("字幕索引返回另一个视频时拒绝继续下载及生成摘要", async () => {
  const { fetcher } = fixture();
  const result = await bili.fetchTranscript(id, async (url, options) => url.includes("/player/wbi/v2?")
    ? { ok: true, json: async () => ({ code: 0, data: { bvid: "BV1G2G369EZp", cid: 999, subtitle: { subtitles: [] } } }) }
    : fetcher(url, options));
  assert.equal(result.success, false);
  assert.equal(result.error, "BILIBILI_VIDEO_MISMATCH");
});

test("旧版 B 站缓存不能继续展示或用于笔记，YouTube 缓存保持兼容", () => {
  const cache = { transcript: [{ start: 0, text: "旧字幕" }] };
  assert.equal(settings.isCompatibleDigestCache(id, cache), false);
  assert.equal(settings.isCompatibleDigestCache(id, { ...cache, provenance: { version: 2, videoId: "bilibili:BV1SR5v6pE8M:p1", cid: 100 } }), false);
  assert.equal(settings.isCompatibleDigestCache(id, { ...cache, provenance: { version: 2, videoId: id, cid: 200 } }), true);
  assert.equal(settings.isCompatibleDigestCache("dQw4w9WgXcQ", cache), true);
});

function fixture({ tracks, loggedIn = true, code = 0 } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    let data;
    if (url.includes("/view?")) {
      data = { code, data: { aid: 123, bvid: "BV1SR5v6pE8M", title: "测试课程", owner: { name: "讲师" }, desc: "简介",
        pages: [{ page: 1, cid: 100, part: "第一节", duration: 30 }, { page: 2, cid: 200, part: "第二节", duration: 60 }] } };
    } else if (url.includes("/player/wbi/v2?")) {
      data = { code: 0, data: { bvid: "BV1SR5v6pE8M", cid: 200, login_mid: loggedIn ? 123 : 0,
        subtitle: { subtitles: tracks ?? [{ lan: "ai-zh", subtitle_url: "//aisubtitle.hdslb.com/subtitle/test.json" }] } } };
    } else {
      data = { body: [{ from: 3.2, to: 5.5, content: "  第二节 <i>开场</i>  " }, { from: 6, to: 8, content: "继续。" }] };
    }
    return { ok: true, json: async () => data };
  };
  return { calls, fetcher };
}

test("分享参数被去除，分 P 和平台缓存键保持独立", () => {
  const first = settings.parseVideoUrl("https://www.bilibili.com/video/BV1SR5v6pE8M/?share_source=COPY&buvid=example");
  assert.equal(first.id, "bilibili:BV1SR5v6pE8M:p1");
  assert.equal(first.url, "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=1");
  assert.equal(settings.parseVideoUrl("https://www.bilibili.com/video/BV1SR5v6pE8M?p=2").id, id);
  assert.equal(settings.parseVideoUrl("https://www.bilibili.com/video/av123?p=2").id, "bilibili:av123:p2");
  assert.equal(settings.parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").id, "dQw4w9WgXcQ");
  assert.equal(settings.timestampedVideoUrl(id, 92.9), "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=2&t=92");
  assert.equal(settings.timestampedVideoUrl("dQw4w9WgXcQ", 92), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=92s");
});

test("不识别伪造域名、非视频页和非法分 P", () => {
  for (const url of ["https://www.bilibili.com.evil.test/video/BV1SR5v6pE8M/", "https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "https://www.bilibili.com/", "https://www.youtube.com/", "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=-1", "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=1.5", "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=9007199254740992", "http://www.bilibili.com/video/BV1SR5v6pE8M/"]) {
    assert.equal(settings.parseVideoUrl(url), null, url);
  }
});

test("选择对应分 P 的 CID，保留秒级时间，不向字幕 CDN 发送登录态", async () => {
  const { calls, fetcher } = fixture();
  const result = await bili.fetchTranscript(id, fetcher);
  assert.equal(result.success, true);
  assert.equal(result.videoInfo.cid, 200);
  assert.match(result.videoInfo.title, /P2 第二节/);
  assert.match(calls[1].url, /cid=200/);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[2].options.credentials, "omit");
  assert.equal(calls[2].options.redirect, "error");
  assert.equal(result.transcript[0].start, 3.2);
  assert.equal(result.transcript[0].text, "第二节 开场");
  assert.match(result.transcriptTextTimestamped, /^\[0:03\]/);
  assert.equal(result.language, "ai-zh");
});

test("未登录、无字幕、无对应分 P 和风控错误可区分", async () => {
  assert.equal((await bili.fetchTranscript(id, fixture({ loggedIn: false, tracks: [] }).fetcher)).error, "BILIBILI_LOGIN_REQUIRED");
  assert.equal((await bili.fetchTranscript(id, fixture({ tracks: [] }).fetcher)).error, "NO_TRANSCRIPT");
  assert.equal((await bili.fetchTranscript("bilibili:BV1SR5v6pE8M:p3", fixture().fetcher)).error, "BILIBILI_PAGE_NOT_FOUND");
  assert.equal((await bili.fetchTranscript(id, fixture({ code: -352 }).fetcher)).error, "BILIBILI_ACCESS_DENIED");
});

test("优先人工中文，损坏轨道回退到下一条可用字幕", async () => {
  const { calls, fetcher } = fixture({ tracks: [
    { lan: "en", subtitle_url: "https://aisubtitle.hdslb.com/english.json" },
    { lan: "zh-CN", subtitle_url: "https://aisubtitle.hdslb.com/chinese.json" },
  ] });
  const result = await bili.fetchTranscript(id, async (url, options) => url.includes("chinese.json")
    ? { ok: true, json: async () => ({ body: [] }) } : fetcher(url, options));
  assert.equal(result.success, true);
  assert.equal(result.language, "en");
  assert.match(calls.at(-1).url, /english.json/);
});

test("拒绝非白名单字幕地址、重定向和空字幕", async () => {
  for (const url of ["https://evil.test/subtitle.json", "http://aisubtitle.hdslb.com/test.json", "https://aisubtitle.hdslb.com.evil.test/test.json", "https://user:pass@aisubtitle.hdslb.com/test.json", "https://aisubtitle.hdslb.com:444/test.json"]) {
    assert.throws(() => bili.subtitleUrl(url), /暂不支持/);
  }
  assert.throws(() => bili.normalizeTranscript([{ from: 1, to: 0, content: "无效" }], "zh"), /为空/);
  const result = await bili.fetchTranscript(id, async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(result.success, false);
});

test("字幕消息沿当前视频标签页传递，拒绝其他分 P", async () => {
  let listener;
  let requested = false;
  const local = vm.createContext({
    YTD_SETTINGS: settings, location: { href: "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=2" },
    BILI_DIGEST: { fetchTranscript: async (key) => { requested = key; return { success: true }; } },
    document: { body: {}, querySelector: () => null, getElementById: () => null },
    window: { addEventListener() {} }, MutationObserver: class { observe() {} },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../bilibili-content.js"), "utf8"), local);
  let result;
  listener({ action: "fetchBilibiliTranscript", videoId: "bilibili:BV1SR5v6pE8M:p1" }, {}, r => { result = r; });
  assert.equal(result.error, "VIDEO_CHANGED");
  assert.equal(requested, false);
  result = await new Promise(resolve => listener({ action: "fetchBilibiliTranscript", videoId: id }, {}, resolve));
  assert.equal(requested, id);
  assert.equal(result.success, true);
});

function backgroundHarness(tabs) {
  const calls = [];
  const storage = {};
  const event = { addListener() {} };
  const local = vm.createContext({
    URL, console, importScripts() {}, YTD_SETTINGS: settings,
    chrome: {
      storage: { local: { setAccessLevel: async () => {},
        get: async key => ({ [key]: storage[key] }), set: async data => Object.assign(storage, data) } },
      runtime: { onMessage: event, onInstalled: event, sendMessage: async () => {} },
      action: { onClicked: event }, sidePanel: { setPanelBehavior() {} },
      tabs: { onUpdated: event, onActivated: event,
        query: async () => tabs,
        get: async tabId => tabs.find(tab => tab.id === tabId),
        sendMessage: async (tabId, message) => { calls.push({ tabId, message }); return { success: true }; } },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../background.js"), "utf8"), local);
  return { local, calls, storage };
}

test("后台使用指定标签页，不会将 B 站请求发往其他视频或 Supadata", async () => {
  const { local, calls } = backgroundHarness([
    { id: 7, url: "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=1" },
    { id: 8, url: "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=2" },
  ]);
  assert.equal((await local.handleFetchTranscript(id, 7)).success, false);
  assert.equal(calls.length, 0);
  assert.equal((await local.handleFetchTranscript(id, 8)).success, true);
  assert.equal(calls[0].tabId, 8);
  assert.equal(calls[0].message.action, "fetchBilibiliTranscript");
  assert.equal((await local.handleFetchTranscript("dQw4w9WgXcQ")).error, "NO_SUPADATA_KEY");
});

test("B 站选中字幕笔记无需密钥，记录正确的分 P 和秒数", async () => {
  const { local, storage } = backgroundHarness([]);
  const result = await local.handleSaveNote(id, 15.8, "第二节", "讲师", "这是要保存的原文。");
  assert.equal(result.success, true);
  assert.equal(result.note.videoId, id);
  assert.equal(result.note.timestampedUrl, "https://www.bilibili.com/video/BV1SR5v6pE8M/?p=2&t=15");
  assert.equal(result.note.text, "这是要保存的原文。");
  assert.ok(Object.values(storage).some(value => Array.isArray(value) && value.length === 1));
});

test("切换分 P 后，旧字幕的迟到响应不会覆盖新字幕或缓存", async () => {
  const pending = new Map();
  const stored = {};
  const element = { style: {}, classList: { toggle() {} }, textContent: "" };
  const event = { addListener() {} };
  const panel = vm.createContext({
    URL, console, YTD_SETTINGS: settings, window: {},
    document: { addEventListener() {}, getElementById: () => element },
    chrome: { runtime: { onMessage: event,
      sendMessage: message => new Promise(resolve => pending.set(message.videoId, resolve)) },
      windows: { getCurrent: async () => ({ id: 1 }) }, tabs: { onUpdated: event, onActivated: event } },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../sidepanel.js"), "utf8"), panel);
  Object.assign(panel, {
    resetTranscriptSearch() {}, loadTranscriptViewState: async () => null,
    loadDisplayLanguageMode: async () => "original", loadFromCache: async () => null,
    renderTranscript() {}, showState() {}, updateLoading() {}, restorePendingTranscriptViewState() {},
    loadNotes() {}, setupExplainFeature() {},
    saveToCache: async key => { stored[key] = vm.runInContext("currentTranscriptText", panel); },
  });
  const firstId = "bilibili:BV1SR5v6pE8M:p1";
  const first = panel.startDigest(firstId, settings.canonicalVideoUrl(firstId));
  await new Promise(resolve => setImmediate(resolve));
  const second = panel.startDigest(id, settings.canonicalVideoUrl(id));
  await new Promise(resolve => setImmediate(resolve));
  const response = text => ({ success: true, transcript: [{ start: 0, duration: 1, text }], transcriptText: text, transcriptTextTimestamped: `[0:00] ${text}` });
  pending.get(id)(response("第二节"));
  await second;
  pending.get(firstId)(response("第一节的迟到结果"));
  await first;
  assert.equal(vm.runInContext("currentVideoId", panel), id);
  assert.equal(vm.runInContext("currentTranscriptText", panel), "第二节");
  assert.deepEqual(stored, { [id]: "第二节" });
});
