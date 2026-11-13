/* =====================================================================
 * 三张活地图 —— 反馈与建议（GitHub Issues 版）
 * ---------------------------------------------------------------------
 * 站点已从 WorkBuddy 迁出，不再依赖任何云 SDK 或密钥。
 *  - 提交：把反馈整理成一条预填好的 GitHub Issue，由访问者在 GitHub 上提交。
 *  - 展示：通过 GitHub 公开 API 读取标题以「[反馈]」开头的 Issue。
 *  - 维护：修改 FEEDBACK_REPO 即可切换仓库；不需要后端、数据库或构建步骤。
 *
 * 说明：GitHub Issue 是公开的；页面会提示不要填写隐私信息。
 * 如果访问者没有 GitHub 账号，可用「复制反馈内容」把整理好的文本发给小组。
 * ===================================================================== */
(function () {
  "use strict";

  var FEEDBACK_REPO = "DaMing27/111";
  var REPO_URL = "https://github.com/" + FEEDBACK_REPO;
  var ISSUES_URL = REPO_URL + "/issues";
  var API_URL =
    "https://api.github.com/repos/" + FEEDBACK_REPO +
    "/issues?state=all&per_page=50&sort=created&direction=desc";

  var MAP_NAMES = { domain: "领域地图", ecosystem: "生态地图", cognition: "认知地图" };
  var TYPES = ["内容错误", "解释不清", "来源问题", "使用问题", "其他建议"];

  var rendered = false;
  var loading = false;
  var loaded = false;
  var issues = [];
  var formRefs = null;

  /* ---------- DOM 工具 ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function externalLink(href, text) {
    var a = el("a", null, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function formatTime(iso) {
    if (!iso) return "未知";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return iso;
    }
  }

  /* ---------- 表单 ---------- */
  function rebuildEntryOptions(select, mapKey) {
    select.innerHTML = "";
    var empty = el("option", null, "（不指定具体条目）");
    empty.value = "";
    select.appendChild(empty);
    if (!mapKey || mapKey === "site") return;
    if (typeof window.getEntriesByMap !== "function") return;
    window.getEntriesByMap(mapKey).forEach(function (entry) {
      var op = el("option", null, entry.name);
      op.value = entry.id;
      select.appendChild(op);
    });
  }

  function buildPayload(refs) {
    var mapKey = refs.targetSelect.value;
    var mapName = mapKey === "site" ? "全站" : (MAP_NAMES[mapKey] || mapKey);
    var entryId = refs.entrySelect.value;
    var target = mapName;
    if (mapKey !== "site" && entryId && typeof window.getEntry === "function") {
      var entry = window.getEntry(entryId);
      if (entry) target += " · " + entry.name;
    }
    return {
      target: target,
      type: refs.typeSelect.value,
      content: refs.contentTa.value.trim(),
      reference: refs.refInput.value.trim(),
      nickname: refs.nickInput.value.trim(),
      page: location.origin + location.pathname,
    };
  }

  function buildIssueBody(payload) {
    return [
      "### 反馈对象",
      payload.target,
      "",
      "### 反馈类型",
      payload.type,
      "",
      "### 具体内容",
      payload.content,
      "",
      "### 依据或参考链接",
      payload.reference || "（未填写）",
      "",
      "### 昵称",
      payload.nickname || "匿名",
      "",
      "### 页面",
      payload.page,
    ].join("\n");
  }

  function buildIssueUrl(payload) {
    var oneLine = payload.content.replace(/\s+/g, " ");
    var title = "[反馈] " + payload.target + "：" + oneLine.slice(0, 30) + (oneLine.length > 30 ? "…" : "");
    return REPO_URL + "/issues/new?title=" + encodeURIComponent(title) +
      "&body=" + encodeURIComponent(buildIssueBody(payload));
  }

  function plainFeedback(payload) {
    return [
      "【反馈】三张活地图 · 数学与算法基础",
      "反馈对象：" + payload.target,
      "反馈类型：" + payload.type,
      "",
      "具体内容：",
      payload.content,
      "",
      "依据或参考链接：" + (payload.reference || "（未填写）"),
      "昵称：" + (payload.nickname || "匿名"),
      "页面：" + payload.page,
    ].join("\n");
  }

  function setMsg(text, cls) {
    if (!formRefs || !formRefs.msg) return;
    formRefs.msg.textContent = text || "";
    formRefs.msg.className = "form-msg" + (cls ? " " + cls : "");
  }

  function validate(refs) {
    var content = refs.contentTa.value.trim();
    if (!content) {
      setMsg("请填写具体内容后再提交。", "err");
      refs.contentTa.focus();
      return false;
    }
    var reference = refs.refInput.value.trim();
    if (reference && !/^https?:\/\//i.test(reference)) {
      setMsg("参考链接仅支持有效的 http 或 https 地址。", "err");
      refs.refInput.focus();
      return false;
    }
    return true;
  }

  function doSubmit(refs) {
    if (!validate(refs)) return;
    var payload = buildPayload(refs);
    var url = buildIssueUrl(payload);
    var win = window.open(url, "_blank");
    if (win) win.opener = null;
    if (refs.issueLinkWrap && refs.issueLink) {
      refs.issueLink.href = url;
      refs.issueLinkWrap.hidden = false;
    }
    setMsg("已打开 GitHub 新 Issue 页面；登录后点「Submit new issue」即可提交。", "ok");
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
      return;
    }
    fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done();
    else setMsg("复制失败，请手动选中文本复制。", "err");
  }

  function doCopy(refs) {
    if (!validate(refs)) return;
    var payload = buildPayload(refs);
    copyText(plainFeedback(payload), function () {
      setMsg("已复制反馈内容；可以直接粘贴到邮件、聊天或 GitHub。", "ok");
    });
  }

  /* ---------- 反馈列表 ---------- */
  function parseField(body, label) {
    if (!body) return "";
    var re = new RegExp("### " + label + "\\s*\\n([\\s\\S]*?)(?=\\n### |$)");
    var m = re.exec(body);
    return m ? m[1].trim() : "";
  }

  function buildIssueCard(issue) {
    var card = el("div", "fb-card");

    var head = el("div", "fb-card-head");
    head.appendChild(el("span", "fb-id", "#" + issue.number));
    head.appendChild(el("span", "fb-target", parseField(issue.body, "反馈对象") || "未注明"));
    head.appendChild(el("span", "fb-type", parseField(issue.body, "反馈类型") || "未注明"));
    var state = el("span", "fb-status", issue.state === "closed" ? "已关闭" : "打开中");
    state.classList.add(issue.state === "closed" ? "st-closed" : "st-open");
    head.appendChild(state);
    card.appendChild(head);

    var title = el("p", "fb-title");
    title.appendChild(externalLink(issue.html_url, (issue.title || "").replace(/^\[反馈\]\s*/, "")));
    card.appendChild(title);

    var content = parseField(issue.body, "具体内容");
    if (content) {
      var excerpt = content.length > 240 ? content.slice(0, 240) + "…" : content;
      card.appendChild(el("p", "fb-content", excerpt));
    }

    var reference = parseField(issue.body, "依据或参考链接");
    if (reference && reference !== "（未填写）" && /^https?:\/\//i.test(reference)) {
      var refWrap = el("p", "fb-ref");
      refWrap.appendChild(externalLink(reference, reference));
      card.appendChild(refWrap);
    }

    var meta = el("div", "fb-meta");
    meta.appendChild(el("span", null, "昵称：" + (parseField(issue.body, "昵称") || "匿名")));
    meta.appendChild(el("span", null, "提交时间：" + formatTime(issue.created_at)));
    meta.appendChild(el("span", null, "评论：" + (issue.comments || 0)));
    meta.appendChild(externalLink(issue.html_url, "在 GitHub 查看 / 回复"));
    card.appendChild(meta);

    return card;
  }

  function renderList() {
    var box = document.getElementById("fb-list");
    if (!box) return;
    box.innerHTML = "";

    var filter = document.getElementById("fb-filter-map");
    var mapVal = filter ? filter.value : "all";
    var rows = issues.filter(function (issue) {
      if (mapVal === "all") return true;
      var target = parseField(issue.body, "反馈对象");
      if (mapVal === "site") return target === "全站";
      var name = MAP_NAMES[mapVal];
      return !!name && target.indexOf(name) === 0;
    });

    if (!rows.length) {
      box.appendChild(el("div", "list-state", mapVal === "all" ? "暂无反馈。" : "这个范围下暂无反馈。"));
      var p = el("p", "fb-help");
      p.appendChild(externalLink(ISSUES_URL, "在 GitHub 查看全部反馈 / 新建 Issue"));
      box.appendChild(p);
      return;
    }

    rows.forEach(function (issue) {
      box.appendChild(buildIssueCard(issue));
    });
  }

  function loadIssues(force) {
    if (!rendered) render();
    if (loading) return;
    if (loaded && !force) return;
    var box = document.getElementById("fb-list");
    if (!box) return;

    loading = true;
    box.innerHTML = "";
    box.appendChild(el("div", "list-state", "正在读取 GitHub Issues…"));

    fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (rows) {
        issues = rows.filter(function (r) {
          return !r.pull_request && /^\[反馈\]/.test(r.title || "");
        });
        loaded = true;
        renderList();
      })
      .catch(function (err) {
        loaded = false;
        box.innerHTML = "";
        box.appendChild(el("div", "list-state err", "暂时无法读取 GitHub Issues。"));
        var p = el("p", "fb-help");
        p.appendChild(externalLink(ISSUES_URL, "直接打开 Issues 列表"));
        box.appendChild(p);
        console.warn("读取反馈失败：", err && err.message ? err.message : err);
      })
      .finally(function () {
        loading = false;
      });
  }

  /* ---------- 渲染反馈页 ---------- */
  function render() {
    var container = document.getElementById("view-feedback");
    if (!container || rendered) return;
    rendered = true;
    container.innerHTML = "";

    var head = el("div", "feedback-head");
    head.appendChild(el("h1", null, "反馈与建议"));
    head.appendChild(el("p", null, "本站已从 WorkBuddy 迁出，反馈通道改为 GitHub Issues。提交后会生成一条公开 Issue；如果暂时不方便登录 GitHub，也可以复制内容后发给小组。"));
    container.appendChild(head);

    var grid = el("div", "feedback-grid");

    /* ---- 左侧：提交表单 ---- */
    var formPanel = el("div", "panel");
    formPanel.appendChild(el("h2", null, "提交反馈"));

    var warn = el("div", "form-warn");
    warn.textContent = "反馈会公开显示在 GitHub 仓库中，请勿填写隐私信息。提交需要 GitHub 账号；也可以使用「复制反馈内容」。";
    formPanel.appendChild(warn);

    var form = document.createElement("form");
    form.setAttribute("novalidate", "");

    var fTarget = el("div", "form-field");
    fTarget.appendChild(el("label", null, "反馈对象"));
    var targetSelect = el("select");
    targetSelect.id = "fb-target-map";
    [
      { v: "site", t: "全站" },
      { v: "domain", t: "领域地图" },
      { v: "ecosystem", t: "生态地图" },
      { v: "cognition", t: "认知地图" },
    ].forEach(function (o) {
      var op = el("option", null, o.t);
      op.value = o.v;
      targetSelect.appendChild(op);
    });
    fTarget.appendChild(targetSelect);
    form.appendChild(fTarget);

    var fEntry = el("div", "form-field");
    fEntry.id = "fb-entry-field";
    fEntry.style.display = "none";
    fEntry.appendChild(el("label", null, "具体条目（可选）"));
    var entrySelect = el("select");
    entrySelect.id = "fb-target-entry";
    fEntry.appendChild(entrySelect);
    form.appendChild(fEntry);

    var fType = el("div", "form-field");
    fType.appendChild(el("label", null, "反馈类型"));
    var typeSelect = el("select");
    typeSelect.id = "fb-type";
    TYPES.forEach(function (t) {
      var op = el("option", null, t);
      op.value = t;
      typeSelect.appendChild(op);
    });
    fType.appendChild(typeSelect);
    form.appendChild(fType);

    var fContent = el("div", "form-field");
    var contentLabel = el("label", "required", "具体内容");
    contentLabel.htmlFor = "fb-content";
    fContent.appendChild(contentLabel);
    fContent.appendChild(el("span", "hint", "请说明：哪里有问题、为什么有疑问、建议怎样修改。"));
    var contentTa = document.createElement("textarea");
    contentTa.id = "fb-content";
    contentTa.maxLength = 2000;
    contentTa.placeholder = "例如：领域地图中「模型评估与泛化」的说明把训练误差和泛化误差混在一起……";
    fContent.appendChild(contentTa);
    var counter = el("div", "char-count", "0 / 2000");
    counter.id = "fb-count";
    fContent.appendChild(counter);
    form.appendChild(fContent);

    var fRef = el("div", "form-field");
    fRef.appendChild(el("label", null, "依据或参考链接（可选）"));
    var refInput = document.createElement("input");
    refInput.type = "url";
    refInput.id = "fb-reference";
    refInput.placeholder = "https://…";
    fRef.appendChild(refInput);
    form.appendChild(fRef);

    var fNick = el("div", "form-field");
    fNick.appendChild(el("label", null, "昵称（可选，默认匿名）"));
    var nickInput = document.createElement("input");
    nickInput.type = "text";
    nickInput.id = "fb-nickname";
    nickInput.maxLength = 30;
    nickInput.placeholder = "匿名";
    fNick.appendChild(nickInput);
    form.appendChild(fNick);

    var actions = el("div", "form-actions");
    var submitBtn = el("button", "btn btn-primary", "在 GitHub 提交反馈");
    submitBtn.type = "submit";
    submitBtn.id = "fb-submit";
    var copyBtn = el("button", "btn btn-outline", "复制反馈内容");
    copyBtn.type = "button";
    copyBtn.id = "fb-copy";
    var msg = el("span", "form-msg");
    msg.id = "fb-msg";
    actions.appendChild(submitBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(msg);
    form.appendChild(actions);

    var issueLinkWrap = el("p", "fb-help");
    issueLinkWrap.hidden = true;
    issueLinkWrap.appendChild(document.createTextNode("新标签页没有打开？"));
    var issueLink = externalLink(ISSUES_URL, "点这里打开 Issue 页面");
    issueLinkWrap.appendChild(issueLink);
    form.appendChild(issueLinkWrap);

    var repoHelp = el("p", "fb-help");
    repoHelp.appendChild(document.createTextNode("反馈仓库："));
    repoHelp.appendChild(externalLink(REPO_URL, FEEDBACK_REPO));
    repoHelp.appendChild(document.createTextNode("。Issue 是公开的，小组会在 GitHub 上回复。"));
    form.appendChild(repoHelp);

    formPanel.appendChild(form);
    grid.appendChild(formPanel);

    /* ---- 右侧：已有反馈 ---- */
    var listPanel = el("div", "panel");
    listPanel.appendChild(el("h2", null, "已有反馈"));

    var controls = el("div", "feedback-list-controls");
    var mapFilter = el("select");
    mapFilter.id = "fb-filter-map";
    [
      { v: "all", t: "全部地图" },
      { v: "site", t: "全站" },
      { v: "domain", t: "领域地图" },
      { v: "ecosystem", t: "生态地图" },
      { v: "cognition", t: "认知地图" },
    ].forEach(function (o) {
      var op = el("option", null, o.t);
      op.value = o.v;
      mapFilter.appendChild(op);
    });
    var refresh = el("button", "btn btn-outline", "刷新");
    refresh.type = "button";
    refresh.id = "fb-refresh";
    controls.appendChild(mapFilter);
    controls.appendChild(refresh);
    listPanel.appendChild(controls);

    var list = el("div", "feedback-list");
    list.id = "fb-list";
    list.appendChild(el("div", "list-state", "正在读取 GitHub Issues…"));
    listPanel.appendChild(list);

    var listHelp = el("p", "fb-help");
    listHelp.appendChild(document.createTextNode("列表只显示标题以「[反馈]」开头的 Issue；如果读取受限，请直接打开 "));
    listHelp.appendChild(externalLink(ISSUES_URL, "GitHub Issues"));
    listHelp.appendChild(document.createTextNode("。"));
    listPanel.appendChild(listHelp);

    grid.appendChild(listPanel);
    container.appendChild(grid);

    /* ---- refs & events ---- */
    formRefs = {
      targetSelect: targetSelect,
      entryField: fEntry,
      entrySelect: entrySelect,
      typeSelect: typeSelect,
      contentTa: contentTa,
      refInput: refInput,
      nickInput: nickInput,
      msg: msg,
      issueLinkWrap: issueLinkWrap,
      issueLink: issueLink,
    };

    targetSelect.addEventListener("change", function () {
      var showEntry = targetSelect.value !== "site";
      fEntry.style.display = showEntry ? "" : "none";
      if (showEntry) rebuildEntryOptions(entrySelect, targetSelect.value);
    });

    contentTa.addEventListener("input", function () {
      counter.textContent = contentTa.value.length + " / 2000";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      doSubmit(formRefs);
    });

    copyBtn.addEventListener("click", function () {
      doCopy(formRefs);
    });

    mapFilter.addEventListener("change", renderList);
    refresh.addEventListener("click", function () {
      loadIssues(true);
    });
  }

  /* ---------- 外部接口（app.js 调用） ---------- */
  function prefill(mapKey, entryName) {
    if (!rendered) render();
    if (!formRefs) return;
    var target = formRefs.targetSelect;
    var entryField = formRefs.entryField;
    var entrySelect = formRefs.entrySelect;
    target.value = mapKey;
    var showEntry = mapKey !== "site";
    entryField.style.display = showEntry ? "" : "none";
    if (showEntry) {
      rebuildEntryOptions(entrySelect, mapKey);
      if (entryName && typeof window.getEntriesByMap === "function") {
        var found = window.getEntriesByMap(mapKey).find(function (e) { return e.name === entryName; });
        if (found) entrySelect.value = found.id;
      }
    }
  }

  window.FeedbackApp = {
    prefill: prefill,
    load: function (force) { loadIssues(!!force); },
    buildIssueUrl: function () {
      return formRefs ? buildIssueUrl(buildPayload(formRefs)) : "";
    },
  };

  /* ---------- 初始化 ---------- */
  function init() {
    render();
    loadIssues();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
