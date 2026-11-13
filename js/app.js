/* =====================================================================
 * 三张活地图 —— 渲染与交互逻辑
 * 负责：路由（六视图）、地图卡片渲染、详情面板（打开/关闭/返回/关联跳转）、
 *      更新记录渲染、键盘操作、反馈入口跳转。
 * 反馈的提交与读取由 feedback.js 负责。
 * ===================================================================== */
(function () {
  "use strict";

  var NAV_ORDER = ["home", "domain", "ecosystem", "cognition", "updates", "todos", "feedback"];
  var detailStack = []; // 详情浏览历史（条目 ID 栈），用于「返回之前查看的内容」
  var lastTrigger = null; // 打开详情前聚焦的元素，用于关闭后恢复焦点

  /* ---------- 工具：DOM 创建 ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function setStatusClass(badge, status) {
    badge.classList.add("status-badge");
    if (/待/.test(status)) badge.classList.add("s-todo");
    else if (/核实|阅读|填写/.test(status)) badge.classList.add("s-check");
    else badge.classList.add("s-ok");
  }

  /* ---------- 路由 ---------- */
  function currentView() {
    var h = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (NAV_ORDER.indexOf(h) === -1) return "home";
    return h;
  }

  function showView(viewKey) {
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = true; });
    var view = document.querySelector('.view[data-view="' + viewKey + '"]');
    if (view) view.hidden = false;

    document.querySelectorAll(".site-nav a").forEach(function (a) {
      a.classList.toggle("active", a.dataset.view === viewKey);
    });

    // 切换视图时关闭详情面板
    closeDetail(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigate(viewKey) {
    if (NAV_ORDER.indexOf(viewKey) === -1) viewKey = "home";
    // 惰性渲染地图与更新记录
    if (viewKey === "domain") renderMap("domain");
    else if (viewKey === "ecosystem") renderMap("ecosystem");
    else if (viewKey === "cognition") renderMap("cognition");
    else if (viewKey === "updates") renderUpdates();
    else if (viewKey === "todos") renderTodos();
    else if (viewKey === "feedback") {
      if (window.FeedbackApp && window.FeedbackApp.load) window.FeedbackApp.load();
    }
    showView(viewKey);
  }

  function route() {
    navigate(currentView());
  }

  // 用 pushState 更新 URL，避免触发 hashchange 造成重复渲染
  function setHashSilently(viewKey) {
    try {
      if (location.hash !== "#" + viewKey) {
        history.pushState(null, "", "#" + viewKey);
      }
    } catch (err) {
      /* 忽略：某些 iframe 环境可能禁用 history API */
    }
  }

  /* ---------- 地图渲染 ---------- */
  function renderMap(mapKey) {
    var map = window.MAPS[mapKey];
    var container = document.querySelector('#view-' + mapKey);
    if (!map || !container) return;
    if (container.dataset.rendered === "1") return;
    container.dataset.rendered = "1";
    container.innerHTML = "";

    var head = el("div", "map-head");
    head.style.setProperty("--map-color", map.color);
    var kicker = el("p", "map-kicker", map.tagline);
    var h1 = el("h1", null, map.name);
    var desc = el("p", "map-desc", map.desc);
    head.appendChild(kicker);
    head.appendChild(h1);
    head.appendChild(desc);
    container.appendChild(head);

    if (mapKey === "domain") {
      container.appendChild(buildNetworkPanel(map));
      var indexHead = el("div", "map-index-head");
      indexHead.appendChild(el("p", "map-index-kicker", "ENTRY INDEX / 条目索引"));
      indexHead.appendChild(el("h2", null, "全部条目（按类别）"));
      indexHead.appendChild(el("p", "map-index-desc", "网络中的领域节点都对应下方一张卡片；生态节点点击后打开生态地图条目。"));
      container.appendChild(indexHead);
    }

    map.categories.forEach(function (cat) {
      var entries = window.getEntriesByMap(mapKey).filter(function (e) { return e.category === cat.id; });
      if (entries.length === 0) return;

      var block = el("div", "category-block");
      block.style.setProperty("--cat", cat.color);

      var titleRow = el("div", "category-title");
      var dot = el("span", "category-dot");
      dot.setAttribute("aria-hidden", "true");
      var titleText = el("span", null, cat.name);
      titleRow.appendChild(dot);
      titleRow.appendChild(titleText);
      titleRow.appendChild(el("span", "category-count", entries.length + " 条"));
      block.appendChild(titleRow);

      var catDesc = el("p", "category-desc", cat.desc);
      block.appendChild(catDesc);

      var grid = el("div", "cards-grid");
      entries.forEach(function (entry) {
        grid.appendChild(buildCard(entry, map, cat));
      });
      block.appendChild(grid);
      container.appendChild(block);
    });
  }

  function buildCard(entry, map, cat) {
    var card = el("button", "entry-card");
    card.type = "button";
    card.style.setProperty("--cat", cat.color);
    card.setAttribute("aria-haspopup", "dialog");
    card.dataset.entryId = entry.id;

    var top = el("div", "entry-card-top");
    if (entry.num) {
      top.appendChild(el("span", "entry-num", entry.num));
    }
    top.appendChild(el("span", "entry-cat", cat.name));
    var badge = el("span", null, entry.status);
    setStatusClass(badge, entry.status);
    top.appendChild(badge);
    card.appendChild(top);

    card.appendChild(el("h3", null, entry.name));
    card.appendChild(el("p", "entry-one", entry.oneLiner));

    var foot = el("div", "entry-card-foot");
    if (entry.role) {
      foot.appendChild(el("span", "entry-role", entry.role));
    }
    foot.appendChild(el("span", "entry-open", "查看详情 →"));
    card.appendChild(foot);
    return card;
  }

  /* ---------- 领域地图：关系网络 ---------- */
  var NET_GROUP_ORDER = ["basic-problem", "core-concept", "method-tool", "ecosystem"];
  var NET_ANCHORS = {
    "basic-problem": { x: 380, y: 250 },
    "core-concept": { x: 650, y: 450 },
    "method-tool": { x: 480, y: 670 },
    ecosystem: { x: 980, y: 380 },
  };

  function svgEl(tag, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    return node;
  }

  function pairKey(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  }

  function buildDomainGraph() {
    var domainEntries = window.getEntriesByMap("domain");
    var extIds = (window.NETWORK && window.NETWORK.externalIds) || [];
    var all = domainEntries.slice();
    extIds.forEach(function (id) {
      var e = window.getEntry(id);
      if (e) all.push(e);
    });

    var ids = {};
    all.forEach(function (e) { ids[e.id] = true; });

    var groups = (window.NETWORK && window.NETWORK.groups) || {};
    var byId = {};
    var nodes = all.map(function (e) {
      var group = e.map === "domain" ? e.category : "ecosystem";
      var meta = groups[group] || {};
      var node = {
        id: e.id,
        entry: e,
        group: group,
        label: e.short || e.name,
        color: meta.color || "#5F5E5A",
        degree: 0,
        x: 0,
        y: 0,
        w: 142,
        h: 50,
      };
      byId[e.id] = node;
      return node;
    });

    var links = [];
    var seen = {};
    all.forEach(function (e) {
      (e.relations || []).forEach(function (r) {
        if (!ids[r.to]) return;
        var a = byId[e.id];
        var b = byId[r.to];
        if (!a || !b) return;
        var key = pairKey(e.id, r.to);
        if (seen[key]) return;
        seen[key] = true;
        var kind = (a.group === "ecosystem" || b.group === "ecosystem") ? "tool" : "concept";
        links.push({ a: e.id, b: r.to, kind: kind, reason: r.reason || "" });
        a.degree += 1;
        b.degree += 1;
      });
    });

    nodes.forEach(function (n) {
      var w = 142;
      if (n.label.length >= 7) w = 156;
      if (n.degree >= 8) w += 10;
      n.w = w;
      n.h = n.degree >= 8 ? 54 : 50;
    });

    return { nodes: nodes, links: links, nodeById: byId, width: 1200, height: 840 };
  }

  /* 确定性力导向布局：无第三方依赖，同一条目集合每次得到相同位置。 */
  function layoutDomainGraph(graph) {
    var W = graph.width;
    var H = graph.height;
    var padX = 94;
    var padY = 62;
    var nodes = graph.nodes;
    var links = graph.links;
    var byId = graph.nodeById;
    var area = (W - padX * 2) * (H - padY * 2);
    var k = Math.sqrt(area / nodes.length);

    nodes.forEach(function (n, i) {
      var anchor = NET_ANCHORS[n.group] || { x: W / 2, y: H / 2 };
      var angle = i * 2.399963229728653;
      var radius = 34 + (i % 6) * 24;
      n.x = anchor.x + Math.cos(angle) * radius;
      n.y = anchor.y + Math.sin(angle) * radius;
    });

    var iters = 720;
    for (var it = 0; it < iters; it++) {
      var alpha = 1 - it / iters;
      var anchorPull = 0.010 * alpha;
      var i, j;

      for (i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var ux = dx / dist;
          var uy = dy / dist;
          var minDist = 154;
          var force = (k * k / dist) * 0.0026 * alpha;
          if (dist < minDist) force += (minDist - dist) * 0.42;
          a.x -= ux * force;
          a.y -= uy * force;
          b.x += ux * force;
          b.y += uy * force;
        }
      }

      for (i = 0; i < links.length; i++) {
        var link = links[i];
        var na = byId[link.a];
        var nb = byId[link.b];
        var ldx = nb.x - na.x;
        var ldy = nb.y - na.y;
        var ldist = Math.sqrt(ldx * ldx + ldy * ldy) || 0.01;
        var rest = link.kind === "tool" ? 268 : 214;
        var spring = (ldist - rest) * 0.020 * alpha;
        var lux = ldx / ldist;
        var luy = ldy / ldist;
        na.x += lux * spring;
        na.y += luy * spring;
        nb.x -= lux * spring;
        nb.y -= luy * spring;
      }

      for (i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var anchor = NET_ANCHORS[n.group] || { x: W / 2, y: H / 2 };
        n.x += (anchor.x - n.x) * anchorPull;
        n.y += (anchor.y - n.y) * anchorPull;
        n.x = Math.max(padX + n.w / 2, Math.min(W - padX - n.w / 2, n.x));
        n.y = Math.max(padY + n.h / 2, Math.min(H - padY - n.h / 2, n.y));
      }
    }

    // 用矩形碰撞做收尾，保证标签框之间不重叠。
    for (var pass = 0; pass < 320; pass++) {
      var moved = false;
      for (i = 0; i < nodes.length; i++) {
        var ra = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          var rb = nodes[j];
          var rdx = rb.x - ra.x;
          var rdy = rb.y - ra.y;
          var minX = (ra.w + rb.w) / 2 + 22;
          var minY = (ra.h + rb.h) / 2 + 14;
          var ox = minX - Math.abs(rdx);
          var oy = minY - Math.abs(rdy);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) {
            var sx = rdx < 0 ? -1 : 1;
            ra.x -= sx * ox / 2;
            rb.x += sx * ox / 2;
          } else {
            var sy = rdy < 0 ? -1 : 1;
            ra.y -= sy * oy / 2;
            rb.y += sy * oy / 2;
          }
          moved = true;
        }
      }
      for (i = 0; i < nodes.length; i++) {
        var cn = nodes[i];
        cn.x = Math.max(padX + cn.w / 2, Math.min(W - padX - cn.w / 2, cn.x));
        cn.y = Math.max(padY + cn.h / 2, Math.min(H - padY - cn.h / 2, cn.y));
      }
      if (!moved) break;
    }

    nodes.forEach(function (node) {
      node.x = Math.round(node.x * 10) / 10;
      node.y = Math.round(node.y * 10) / 10;
    });
  }

  function edgePath(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var bend = Math.min(36, len * 0.07);
    var sign = a.id < b.id ? 1 : -1;
    var cx = mx + (dy / len) * bend * sign;
    var cy = my - (dx / len) * bend * sign;
    return "M" + a.x + " " + a.y + " Q" + cx + " " + cy + " " + b.x + " " + b.y;
  }

  function renderDomainGraph(graph, gLinks, gNodes) {
    var nodeEls = {};
    var edgeEls = {};
    var linkLayer = gLinks;
    var nodeLayer = gNodes;

    graph.links.forEach(function (link) {
      var a = graph.nodeById[link.a];
      var b = graph.nodeById[link.b];
      var cls = "net-edge" + (link.kind === "tool" ? " net-edge--tool" : "");
      var path = svgEl("path", { "class": cls, d: edgePath(a, b) });
      path.setAttribute("data-a", link.a);
      path.setAttribute("data-b", link.b);
      var tip = svgEl("title");
      tip.textContent = a.label + " — " + b.label + (link.reason ? "：" + link.reason : "");
      path.appendChild(tip);
      linkLayer.appendChild(path);
      edgeEls[pairKey(link.a, link.b)] = path;
    });

    graph.nodes.forEach(function (n) {
      var cls = "net-node";
      if (n.group === "ecosystem") cls += " net-node--eco";
      if (n.degree >= 8) cls += " net-node--hub";
      var g = svgEl("g", {
        "class": cls,
        transform: "translate(" + n.x + "," + n.y + ")",
        tabindex: "0",
        role: "button",
        focusable: "true",
        "data-entry-id": n.id,
        "aria-label": n.entry.name + "，属于" + ((window.NETWORK.groups[n.group] || {}).name || n.group) + "，按回车查看详情",
      });
      g.style.setProperty("--cat", n.color);

      var tip = svgEl("title");
      tip.textContent = n.entry.name + "：" + n.entry.oneLiner;
      g.appendChild(tip);

      var halo = svgEl("rect", {
        "class": "net-node__halo",
        x: -n.w / 2 - 4,
        y: -n.h / 2 - 4,
        width: n.w + 8,
        height: n.h + 8,
        rx: 14,
        ry: 14,
      });
      g.appendChild(halo);

      var box = svgEl("rect", {
        "class": "net-node__box",
        x: -n.w / 2,
        y: -n.h / 2,
        width: n.w,
        height: n.h,
        rx: 10,
        ry: 10,
      });
      g.appendChild(box);

      var accent = svgEl("rect", {
        "class": "net-node__accent",
        x: -n.w / 2 + 1,
        y: -n.h / 2 + 7,
        width: 4,
        height: n.h - 14,
        rx: 2,
        ry: 2,
      });
      g.appendChild(accent);

      var num = svgEl("text", {
        "class": "net-node__num",
        x: -n.w / 2 + 14,
        y: -n.h / 2 + 15,
      });
      num.textContent = n.entry.num || "";
      g.appendChild(num);

      if (n.group === "ecosystem") {
        var tag = svgEl("text", {
          "class": "net-node__tag",
          x: n.w / 2 - 10,
          y: -n.h / 2 + 15,
          "text-anchor": "end",
        });
        tag.textContent = "生态";
        g.appendChild(tag);
      }

      var label = svgEl("text", {
        "class": "net-node__label",
        x: 2,
        y: 8,
        "text-anchor": "middle",
      });
      label.textContent = n.label;
      g.appendChild(label);

      nodeLayer.appendChild(g);
      nodeEls[n.id] = g;
    });

    return { nodeEls: nodeEls, edgeEls: edgeEls };
  }

  function buildNetworkPanel(map) {
    var graph = buildDomainGraph();
    var panel = el("section", "network-panel");
    panel.setAttribute("aria-labelledby", "network-title");

    var counts = { "basic-problem": 0, "core-concept": 0, "method-tool": 0, ecosystem: 0 };
    graph.nodes.forEach(function (n) { counts[n.group] = (counts[n.group] || 0) + 1; });

    var head = el("div", "network-head");
    head.appendChild(el("p", "network-kicker", "DOMAIN NETWORK / 关系网络"));
    var titleRow = el("div", "network-title-row");
    var title = el("h2", null, "基本问题、概念与工具，怎样连成一张网");
    title.id = "network-title";
    titleRow.appendChild(title);
    titleRow.appendChild(el("span", "network-count", graph.nodes.length + " 个节点 · " + graph.links.length + " 条关联"));
    head.appendChild(titleRow);
    head.appendChild(el("p", "network-desc",
      "从 " + counts["basic-problem"] + " 个基本问题出发，经过 " + counts["core-concept"] +
      " 个核心概念，落到 " + counts["method-tool"] + " 个方法与工具；" + counts.ecosystem +
      " 个与领域知识有直接关联的生态节点以虚线接入。悬停或聚焦节点可高亮它的直接关联，点击节点查看条目详情。"));
    panel.appendChild(head);

    var toolbar = el("div", "network-toolbar");
    var legend = el("div", "network-legend");
    legend.setAttribute("role", "group");
    legend.setAttribute("aria-label", "按节点类别聚焦");
    NET_GROUP_ORDER.forEach(function (key) {
      var meta = (window.NETWORK.groups || {})[key];
      if (!meta || !counts[key]) return;
      var btn = el("button", "net-filter");
      btn.type = "button";
      btn.setAttribute("data-net-filter", key);
      btn.setAttribute("aria-pressed", "false");
      var dot = el("span", "net-filter-dot");
      dot.style.background = meta.color;
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(meta.name + " · " + counts[key]));
      legend.appendChild(btn);
    });
    toolbar.appendChild(legend);

    var reset = el("button", "btn btn-outline net-reset", "显示全部");
    reset.type = "button";
    reset.setAttribute("data-net-reset", "");
    reset.disabled = true;
    toolbar.appendChild(reset);
    panel.appendChild(toolbar);

    var lineKey = el("div", "network-lines");
    var solidKey = el("span", "network-line-key");
    solidKey.appendChild(el("i", "net-line net-line--solid"));
    solidKey.appendChild(document.createTextNode("领域内关联"));
    var dashKey = el("span", "network-line-key");
    dashKey.appendChild(el("i", "net-line net-line--dash"));
    dashKey.appendChild(document.createTextNode("通往生态工具 / 资源"));
    lineKey.appendChild(solidKey);
    lineKey.appendChild(dashKey);
    lineKey.appendChild(el("span", "network-line-tip", "点击图例可聚焦一类节点；再次点击取消。"));
    panel.appendChild(lineKey);

    var scroll = el("div", "network-scroll");
    var canvas = el("div", "network-canvas");
    var svg = svgEl("svg", {
      "class": "network-svg",
      viewBox: "0 0 " + graph.width + " " + graph.height,
      preserveAspectRatio: "xMidYMid meet",
      role: "group",
      "aria-labelledby": "network-svg-title network-svg-desc",
      focusable: "false",
    });
    var svgTitle = svgEl("title", { id: "network-svg-title" });
    svgTitle.textContent = "领域地图关系网络";
    var svgDesc = svgEl("desc", { id: "network-svg-desc" });
    svgDesc.textContent = "共 " + graph.nodes.length + " 个节点、" + graph.links.length +
      " 条关联。节点按基本问题、核心概念、方法与工具和生态节点着色；按 Tab 聚焦节点，按回车打开详情。";
    svg.appendChild(svgTitle);
    svg.appendChild(svgDesc);

    var defs = svgEl("defs");
    var pattern = svgEl("pattern", {
      id: "net-dot-grid",
      width: "26",
      height: "26",
      patternUnits: "userSpaceOnUse",
    });
    pattern.appendChild(svgEl("circle", { cx: "1.2", cy: "1.2", r: "1.1", fill: "#d7d5cc" }));
    defs.appendChild(pattern);
    svg.appendChild(defs);
    svg.appendChild(svgEl("rect", {
      x: "0",
      y: "0",
      width: graph.width,
      height: graph.height,
      fill: "url(#net-dot-grid)",
      opacity: "0.55",
    }));

    var gLinks = svgEl("g", { "class": "net-links" });
    var gNodes = svgEl("g", { "class": "net-nodes" });
    svg.appendChild(gLinks);
    svg.appendChild(gNodes);

    layoutDomainGraph(graph);
    var rendered = renderDomainGraph(graph, gLinks, gNodes);
    canvas.appendChild(svg);
    scroll.appendChild(canvas);
    panel.appendChild(scroll);
    panel.appendChild(el("p", "network-hint", "图中的蓝色、绿色、灰色节点对应下方卡片；锈色虚线框来自生态地图。手机端可左右滑动查看完整网络。"));

    var nodeEls = rendered.nodeEls;
    var edgeEls = rendered.edgeEls;
    var active = {};

    function clearHighlight() {
      graph.nodes.forEach(function (n) {
        var node = nodeEls[n.id];
        if (node) node.classList.remove("is-active", "is-neighbor", "is-dim");
      });
      graph.links.forEach(function (l) {
        var edge = edgeEls[pairKey(l.a, l.b)];
        if (edge) edge.classList.remove("is-hot", "is-dim");
      });
    }

    function highlight(id) {
      var near = {};
      graph.links.forEach(function (l) {
        if (l.a === id) near[l.b] = true;
        else if (l.b === id) near[l.a] = true;
      });
      graph.nodes.forEach(function (n) {
        var node = nodeEls[n.id];
        if (!node) return;
        node.classList.remove("is-active", "is-neighbor", "is-dim");
        if (n.id === id) node.classList.add("is-active");
        else if (near[n.id]) node.classList.add("is-neighbor");
        else node.classList.add("is-dim");
      });
      graph.links.forEach(function (l) {
        var edge = edgeEls[pairKey(l.a, l.b)];
        if (!edge) return;
        edge.classList.remove("is-hot", "is-dim");
        if (l.a === id || l.b === id) edge.classList.add("is-hot");
        else edge.classList.add("is-dim");
      });
    }

    function applyFilters() {
      var activeKeys = Object.keys(active);
      var hasFilter = activeKeys.length > 0;
      clearHighlight();
      graph.nodes.forEach(function (n) {
        var node = nodeEls[n.id];
        if (!node) return;
        var faded = hasFilter && !active[n.group];
        node.classList.toggle("is-faded", faded);
        node.setAttribute("tabindex", faded ? "-1" : "0");
      });
      graph.links.forEach(function (l) {
        var edge = edgeEls[pairKey(l.a, l.b)];
        if (!edge) return;
        var a = graph.nodeById[l.a];
        var b = graph.nodeById[l.b];
        var faded = hasFilter && (!active[a.group] || !active[b.group]);
        edge.classList.toggle("is-faded", faded);
      });
      reset.disabled = !hasFilter;
      legend.querySelectorAll("[data-net-filter]").forEach(function (btn) {
        var key = btn.getAttribute("data-net-filter");
        btn.setAttribute("aria-pressed", active[key] ? "true" : "false");
      });
    }

    legend.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-net-filter]");
      if (!btn) return;
      var key = btn.getAttribute("data-net-filter");
      if (active[key]) delete active[key];
      else active[key] = true;
      applyFilters();
    });

    reset.addEventListener("click", function () {
      active = {};
      applyFilters();
    });

    function nodeFromEvent(e) {
      return e.target.closest ? e.target.closest(".net-node") : null;
    }

    svg.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var node = nodeFromEvent(e);
      if (!node || node.classList.contains("is-faded")) return;
      if (e.relatedTarget && node.contains(e.relatedTarget)) return;
      highlight(node.getAttribute("data-entry-id"));
    });

    svg.addEventListener("pointerout", function (e) {
      var node = nodeFromEvent(e);
      if (!node) return;
      if (e.relatedTarget && node.contains(e.relatedTarget)) return;
      clearHighlight();
    });

    svg.addEventListener("focusin", function (e) {
      var node = nodeFromEvent(e);
      if (!node || node.classList.contains("is-faded")) return;
      highlight(node.getAttribute("data-entry-id"));
    });

    svg.addEventListener("focusout", function (e) {
      var node = nodeFromEvent(e);
      if (!node) return;
      clearHighlight();
    });

    return panel;
  }

  /* 详情面板的相关条目：同时收集本条指向别人、以及别人指向本条的关联。 */
  function collectRelated(entry) {
    var out = [];
    var seen = {};
    function push(to, reason, reverse) {
      if (!to || to === entry.id || seen[to]) return;
      if (!window.getEntry(to)) return;
      seen[to] = true;
      out.push({ to: to, reason: reason || "", reverse: !!reverse });
    }
    (entry.relations || []).forEach(function (r) { push(r.to, r.reason, false); });
    window.ENTRIES.forEach(function (other) {
      (other.relations || []).forEach(function (r) {
        if (r.to === entry.id) push(other.id, r.reason, true);
      });
    });
    return out;
  }

  /* ---------- 详情面板 ---------- */
  function openDetail(entryId, trigger) {
    var entry = window.getEntry(entryId);
    if (!entry) return;
    detailStack.push(entryId);
    lastTrigger = trigger || document.activeElement;
    renderDetail(entryId);
    var panel = document.getElementById("detail-panel");
    panel.hidden = false;
    document.body.style.overflow = "hidden";
    var content = document.getElementById("detail-content");
    content.focus();
  }

  function renderDetail(entryId) {
    var entry = window.getEntry(entryId);
    var map = window.MAPS[entry.map];
    var catName = window.getCategoryLabel(entry.map, entry.category);
    var content = document.getElementById("detail-content");
    content.innerHTML = "";
    content.style.setProperty("--map-color", map.color);

    // 顶部：地图标签 + 关闭按钮
    var topbar = el("div", "detail-topbar");
    var left = el("div");
    var kicker = el("div", "detail-kicker");
    var mapTag = el("span", "detail-map-tag", map.name);
    var catTag = el("span", "entry-cat", catName);
    catTag.style.color = map.color;
    kicker.appendChild(mapTag);
    kicker.appendChild(catTag);
    if (entry.num) {
      kicker.appendChild(el("span", "entry-num", entry.num));
    }
    left.appendChild(kicker);
    left.appendChild(el("h2", null, entry.name));
    topbar.appendChild(left);

    var closeBtn = el("button", "detail-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭详情");
    closeBtn.setAttribute("data-close-detail", "");
    topbar.appendChild(closeBtn);
    content.appendChild(topbar);

    // 返回上一层（若有多层历史）
    if (detailStack.length > 1) {
      var backWrap = el("div", "detail-back");
      var backBtn = el("button", "btn btn-outline", "← 返回上一项");
      backBtn.type = "button";
      backBtn.setAttribute("data-back-detail", "");
      backWrap.appendChild(backBtn);
      content.appendChild(backWrap);
    }

    // 状态
    var statusRow = el("p", null);
    statusRow.style.color = "var(--text-faint)";
    statusRow.style.fontSize = "13.5px";
    var badge = el("span", null, "状态：" + entry.status);
    setStatusClass(badge, entry.status);
    statusRow.appendChild(badge);
    content.appendChild(statusRow);

    var d = entry.detail;

    // 基本说明
    content.appendChild(buildSection("基本说明", [d.basic]));

    // 与选题的关系
    content.appendChild(buildSection("与选题的关系", [d.relation]));

    // 三条成长路线怎么看（主要视角 + 三角色分工）
    if (entry.roles && entry.roles.length) {
      var rolesSec = el("div", "detail-section");
      rolesSec.appendChild(el("h3", null, "三条成长路线怎么看"));
      if (entry.role) {
        var lead = el("p", null, "主要视角：" + entry.role);
        rolesSec.appendChild(lead);
      }
      var rolesList = el("div", "role-list");
      entry.roles.forEach(function (r) {
        var item = el("div", "role-item");
        item.appendChild(el("span", "role-name", r.role));
        item.appendChild(el("span", "role-text", r.text));
        rolesList.appendChild(item);
      });
      rolesSec.appendChild(rolesList);
      content.appendChild(rolesSec);
    }

    // 应用举例（可选，用于说明概念如何落到具体任务）
    if (d.application) {
      content.appendChild(buildSection("应用举例", [d.application]));
    }

    // 相关条目（含反向关联：别人指向本条的关系也会列出）
    var related = collectRelated(entry);
    if (related.length) {
      var sec = el("div", "detail-section");
      sec.appendChild(el("h3", null, "相关条目"));
      sec.appendChild(el("p", "relation-note", "包含本条指向的条目，以及其他条目指向本条的关系。"));
      var list = el("div", "relation-list");
      related.forEach(function (r) {
        var target = window.getEntry(r.to);
        if (!target) return;
        var item = el("button", "relation-item");
        item.type = "button";
        item.dataset.goto = r.to;
        if (r.reverse) item.classList.add("relation-item--reverse");
        var tgtName = el("span", "relation-target", target.name);
        var reason = el("span", "relation-reason", r.reason);
        item.appendChild(tgtName);
        item.appendChild(reason);
        list.appendChild(item);
      });
      sec.appendChild(list);
      content.appendChild(sec);
    }

    // 填写框架（认知地图）
    if (d.framework && d.framework.length) {
      var fsec = el("div", "detail-section");
      fsec.appendChild(el("h3", null, "填写框架"));
      var fw = el("div", "framework");
      var ol = el("ol");
      d.framework.forEach(function (line) {
        var li = el("li", null, line);
        ol.appendChild(li);
      });
      fw.appendChild(ol);
      fsec.appendChild(fw);
      content.appendChild(fsec);
    }

    // 来源或依据
    content.appendChild(buildSection("来源或依据", [d.sources]));

    // 当前理解与尚存问题
    var und = el("div", "detail-section");
    und.appendChild(el("h3", null, "当前理解与尚存问题"));
    und.appendChild(el("p", null, d.understanding));
    if (d.questions) {
      und.appendChild(el("p", null, "尚存问题：" + d.questions));
    }
    content.appendChild(und);

    // 后续学习入口
    content.appendChild(buildSection("后续学习入口", [d.learningEntry]));

    // 反馈按钮
    var fbBtn = el("button", "btn btn-primary detail-feedback-btn", "对此内容提反馈");
    fbBtn.type = "button";
    fbBtn.dataset.feedbackFor = entry.id;
    content.appendChild(fbBtn);
  }

  function buildSection(title, paras) {
    var sec = el("div", "detail-section");
    sec.appendChild(el("h3", null, title));
    paras.forEach(function (p) {
      if (p) sec.appendChild(el("p", null, p));
    });
    return sec;
  }

  function closeDetail(restoreFocus) {
    var panel = document.getElementById("detail-panel");
    panel.hidden = true;
    document.body.style.overflow = "";
    detailStack = [];
    if (restoreFocus && lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
    lastTrigger = null;
  }

  function backDetail() {
    if (detailStack.length <= 1) return;
    detailStack.pop();
    renderDetail(detailStack[detailStack.length - 1]);
    document.getElementById("detail-content").focus();
  }

  /* ---------- 更新记录渲染 ---------- */
  function renderUpdates() {
    var container = document.querySelector('#view-updates');
    if (!container) return;
    if (container.dataset.rendered === "1") return;
    container.dataset.rendered = "1";
    container.innerHTML = "";

    var head = el("div", "updates-head");
    head.appendChild(el("h1", null, "更新记录"));
    head.appendChild(el("p", null, "按时间倒序记录平台的实际修改。每次更新新增一条版本，不覆盖历史记录。"));
    container.appendChild(head);

    // 待办入口卡片（待办有独立视图）
    if (window.TODOS && window.TODOS.length) {
      var count = window.TODOS.reduce(function (n, g) { return n + g.items.length; }, 0);
      var todoEntry = el("a", "todo-entry");
      todoEntry.href = "#todos";
      todoEntry.setAttribute("data-view-link", "todos");
      todoEntry.innerHTML = "";
      var tLeft = el("div");
      tLeft.appendChild(el("span", "todo-entry-title", "待办清单"));
      tLeft.appendChild(el("span", "todo-entry-desc", "未完成的课程要求集中在这里，不进版本记录。"));
      todoEntry.appendChild(tLeft);
      todoEntry.appendChild(el("span", "todo-entry-count", "待办 " + count + " 项 →"));
      container.appendChild(todoEntry);
    }

    window.VERSIONS.forEach(function (v) {
      var card = el("details", "version-card");
      var summary = el("summary");
      var face = el("div", "version-face");
      face.appendChild(el("span", "version-badge", v.version));
      face.appendChild(el("span", "version-date", v.date));
      face.appendChild(el("span", "version-summary", v.summary));
      summary.appendChild(face);
      card.appendChild(summary);

      var body = el("div", "version-detail");
      var dl = el("dl");

      function row(label, value, isList) {
        var dt = el("dt", null, label);
        var dd = el("dd");
        if (isList && Array.isArray(value)) {
          var ul = el("ul");
          value.forEach(function (x) { ul.appendChild(el("li", null, x)); });
          dd.appendChild(ul);
        } else {
          dd.textContent = value || "";
        }
        dl.appendChild(dt);
        dl.appendChild(dd);
      }

      row("涉及地图", v.detail.maps.join("、"));
      row("涉及条目", v.detail.entries, true);
      row("具体修改", v.detail.changes, true);
      row("修改原因与依据", v.detail.reason);
      row("尚存问题", v.detail.openIssues);
      row("下一步计划", v.detail.nextPlan);
      row("实际分工", v.detail.division);
      row("检查结果", v.detail.check);
      row("相关反馈编号", (v.detail.feedbackIds && v.detail.feedbackIds.length) ? v.detail.feedbackIds.join("、") : "暂无");

      body.appendChild(dl);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  /* ---------- 待办视图渲染 ---------- */
  function renderTodos() {
    var container = document.querySelector('#view-todos');
    if (!container) return;
    if (container.dataset.rendered === "1") return;
    container.dataset.rendered = "1";
    container.innerHTML = "";

    var head = el("div", "updates-head");
    head.appendChild(el("h1", null, "待办清单"));
    head.appendChild(el("p", null, "尚未完成的课程要求集中在这里，完成一项移除一项；已完成的修改进入更新记录，不混在此处。"));
    container.appendChild(head);

    if (!window.TODOS || !window.TODOS.length) {
      container.appendChild(el("div", "list-state", "暂无待办。"));
      return;
    }

    window.TODOS.forEach(function (g) {
      var block = el("div", "todo-group");
      block.appendChild(el("h2", null, g.group));
      var ul = el("ul", "todo-items");
      g.items.forEach(function (item) {
        var li = el("li", null, item);
        ul.appendChild(li);
      });
      block.appendChild(ul);
      container.appendChild(block);
    });
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener("click", function (e) {
    // 顶部导航链接：直接切换视图（不依赖 hashchange）
    var navLink = e.target.closest(".site-nav a[data-view]");
    if (navLink) {
      e.preventDefault();
      var v = navLink.dataset.view;
      setHashSilently(v);
      navigate(v);
      return;
    }
    // 首页入口卡片：直接切换视图
    var entryCard = e.target.closest("a.map-entry-card");
    if (entryCard) {
      e.preventDefault();
      var href = entryCard.getAttribute("href") || "#home";
      var viewFromCard = href.replace(/^#\/?/, "").split("?")[0];
      setHashSilently(viewFromCard);
      navigate(viewFromCard);
      return;
    }
    // 页内视图链接（如更新记录页的「待办清单」入口）
    var viewLink = e.target.closest("[data-view-link]");
    if (viewLink) {
      e.preventDefault();
      var target = viewLink.dataset.viewLink;
      setHashSilently(target);
      navigate(target);
      return;
    }
    // 领域关系网络节点
    var netNode = e.target.closest(".net-node");
    if (netNode) {
      var netId = netNode.getAttribute("data-entry-id");
      if (netId) openDetail(netId, netNode);
      return;
    }
    // 打开卡片详情
    var card = e.target.closest(".entry-card");
    if (card) {
      openDetail(card.dataset.entryId, card);
      return;
    }
    // 关闭详情
    if (e.target.closest("[data-close-detail]")) {
      closeDetail(true);
      return;
    }
    // 详情内返回上一层
    if (e.target.closest("[data-back-detail]")) {
      backDetail();
      return;
    }
    // 关联条目跳转
    var rel = e.target.closest("[data-goto]");
    if (rel) {
      openDetail(rel.dataset.goto, rel);
      return;
    }
    // 首页跨图探索路线：点击步骤 → 跳到对应地图并打开该条目详情
    var step = e.target.closest("[data-route-step]");
    if (step) {
      e.preventDefault();
      var entry = window.getEntry(step.dataset.routeStep);
      if (!entry) return;
      setHashSilently(entry.map);
      navigate(entry.map);
      openDetail(entry.id, step);
      return;
    }
    // 详情内反馈按钮 → 跳到反馈页并带入对象
    var fb = e.target.closest("[data-feedback-for]");
    if (fb) {
      closeDetail(false);
      setHashSilently("feedback");
      navigate("feedback");
      var entry = window.getEntry(fb.dataset.feedbackFor);
      if (entry && window.FeedbackApp && window.FeedbackApp.prefill) {
        window.FeedbackApp.prefill(entry.map, entry.name);
      }
      return;
    }
  });

  /* ---------- 键盘操作 ---------- */
  document.addEventListener("keydown", function (e) {
    var panel = document.getElementById("detail-panel");
    if (panel.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDetail(true);
    }
  });

  // 卡片/关联条目支持回车与空格（button 原生支持，这里补空格滚动防护）
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    var isCard = t.classList && (t.classList.contains("entry-card") || t.classList.contains("relation-item"));
    if (isCard && e.key === " " && e.target.tagName === "BUTTON") {
      // 原生 button 已处理，无需额外动作
    }
  });

  // 关系网络节点：Enter / 空格打开详情（SVG 的 <g> 不会原生触发 click）
  document.addEventListener("keydown", function (e) {
    var netNode = e.target.closest ? e.target.closest(".net-node") : null;
    if (!netNode) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      var netId = netNode.getAttribute("data-entry-id");
      if (netId) openDetail(netId, netNode);
    }
  });

  /* ---------- 首页跨图探索路线渲染 ---------- */
  function renderRoutes() {
    var list = document.getElementById("route-list");
    if (!list || !window.CROSS_ROUTES) return;
    list.innerHTML = "";
    window.CROSS_ROUTES.forEach(function (route, ri) {
      var item = el("div", "route-item");
      var title = el("div", "route-title", "路线" + "一二三"[ri] + "：" + route.title);
      var desc = el("div", "route-desc", route.desc);
      item.appendChild(title);
      item.appendChild(desc);

      var stepsWrap = el("div", "route-steps-wrap");
      route.steps.forEach(function (s, i) {
        var row = el("div", "route-step-row");
        var headRow = el("div", "route-step-head");
        if (i > 0) {
          var arrow = el("span", "route-arrow", "→");
          arrow.setAttribute("aria-hidden", "true");
          headRow.appendChild(arrow);
        }
        var stepBtn = el("button", "route-step");
        stepBtn.type = "button";
        stepBtn.dataset.routeStep = s.to;
        stepBtn.textContent = s.label;
        headRow.appendChild(stepBtn);
        row.appendChild(headRow);
        if (s.reason) {
          row.appendChild(el("div", "route-step-reason", s.reason));
        }
        stepsWrap.appendChild(row);
      });
      item.appendChild(stepsWrap);
      list.appendChild(item);
    });
  }

  /* ---------- 首页状态图例 ---------- */
  var LEGEND = [
    { cls: "s-todo", name: "待深入学习", meaning: "知道它的位置和价值，但尚未掌握细节，也没有核对外部资料。" },
    { cls: "s-check", name: "待核实", meaning: "表述可能与资料不符，正在或需要对照原书、论文核实。" },
    { cls: "s-check", name: "待阅读", meaning: "只登记了入口，还没有读具体材料，不形成任何阅读收获。" },
    { cls: "s-todo", name: "待实验 / 待填写", meaning: "框架已建好，但实验未运行、内容未填写，不预填、不编造。" },
  ];

  function renderLegend() {
    var box = document.getElementById("legend-list");
    if (!box) return;
    box.innerHTML = "";
    LEGEND.forEach(function (item) {
      var row = el("div", "legend-row");
      var badge = el("span", "status-badge " + item.cls, item.name);
      row.appendChild(badge);
      row.appendChild(el("span", "legend-meaning", item.meaning));
      box.appendChild(row);
    });
  }

  /* ---------- 初始化 ---------- */
  window.addEventListener("hashchange", route);

  function init() {
    var verEl = document.getElementById("home-version");
    if (verEl) verEl.textContent = window.SITE.version;
    renderRoutes();
    renderLegend();
    route();
    // 详情面板聚焦陷阱：保持焦点在面板内
    var panel = document.getElementById("detail-panel");
    panel.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var content = document.getElementById("detail-content");
      var focusables = content.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (focusables.length === 0) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
