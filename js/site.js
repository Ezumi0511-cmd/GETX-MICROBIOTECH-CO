/* 網站行為：語言切換、內容渲染、案例篩選、預約表單。
   文字內容存放在 content/*.json，請透過 Pages CMS 後台編輯，這個檔案通常不需要動。 */
(function () {
  "use strict";
  var S = null; // 載入 content/*.json 後組成
  // settings.json 內含 brand / contact / booking 三區，其餘每個檔案對應一個區塊
  var FILES = ["settings", "hero", "about", "story", "services", "process", "cases", "faq", "bookingSection", "ui"];

  // CMS 把清單清空時可能存成 null，一律當成空陣列
  function A(v) { return Array.isArray(v) ? v : []; }
  // CMS 存的圖片路徑以 / 開頭，去掉後才能在子目錄網址（如 GitHub Pages）下正常顯示
  function src(p) { return /^(https?:)?\/\//.test(p) ? p : p.replace(/^\/+/, ""); }
  var lang = "zh";
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "zh"; } catch (e) {}
  var activeFilter = null; // null = 全部；否則為案例分類的 zh 名稱

  var $ = function (id) { return document.getElementById(id); };

  // 取出目前語言的文字
  function t(v) {
    return v && typeof v === "object" && "zh" in v ? (v[lang] || v.zh || "") : v;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fill(node, children) {
    node.replaceChildren.apply(node, children);
  }

  function lookup(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, S);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    document.title = t(S.brand.fullName) + (lang === "zh" ? "｜" : " | ") + t(S.hero.eyebrow);

    document.querySelectorAll("[data-t]").forEach(function (n) {
      n.textContent = t(lookup(n.dataset.t)) || "";
    });

    $("langBtn").textContent = lang === "zh" ? "EN" : "中文";

    // Logo
    var mark = $("logoMark");
    if (S.brand.logoImage) {
      var img = el("img");
      img.src = src(S.brand.logoImage);
      img.alt = "";
      mark.classList.add("has-img");
      fill(mark, [img]);
    } else {
      mark.textContent = S.brand.logoLetter;
    }

    // 各區塊圖片（後台清空圖片欄位時自動隱藏）
    var hero = $("top");
    hero.classList.toggle("has-img", !!S.hero.image);
    // 轉成完整網址：CSS 變數裡的相對路徑會以 css/ 資料夾為基準，導致找不到圖
    hero.style.setProperty("--hero-img", S.hero.image ? 'url("' + new URL(src(S.hero.image), document.baseURI).href + '")' : "none");
    setImg($("aboutImg"), S.about.image, t(S.about.title));
    setImg($("storyImg"), S.story.image, t(S.story.title));
    setImg($("servicesImg"), S.services.image, t(S.services.title));
    setImg($("bookingImg"), S.bookingSection.image, "");

    // 首頁數據
    fill($("stats"), A(S.hero.stats).map(function (s) {
      var d = el("div");
      d.append(el("dt", null, s.value), el("dd", null, t(s.label)));
      return d;
    }));

    // 關於我們
    fill($("aboutText"), A(S.about.paragraphs).map(function (p) { return el("p", null, t(p)); }));
    fill($("facts"), A(S.about.facts).map(function (f) {
      var d = el("div");
      d.append(el("dt", null, t(f.label)), el("dd", null, t(f.value)));
      return d;
    }));
    var industries = A(S.about.industries);
    fill($("industryList"), industries.map(function (x) { return el("li", null, t(x)); }));
    $("industries").hidden = industries.length === 0;

    // 品牌故事／技術介紹（右欄清單：有年份就顯示年份，沒有就只顯示文字）
    fill($("storyText"), A(S.story.paragraphs).map(function (p) { return el("p", null, t(p)); }));
    var milestones = A(S.story.milestones);
    fill($("timeline"), milestones.map(function (m) {
      var li = el("li");
      if (m.year) li.append(el("strong", null, m.year));
      li.append(document.createTextNode(t(m.text)));
      return li;
    }));
    $("storyAside").hidden = milestones.length === 0;
    $("storyAside").parentNode.classList.toggle("single", milestones.length === 0);

    // 沒有內容的區塊（例如尚未提供成功案例或常見問題）連同選單連結一起隱藏
    showSection("cases", A(S.cases.items).length > 0);
    showSection("faq", A(S.faq.items).length > 0);

    // 服務內容
    fill($("serviceList"), A(S.services.items).map(function (s) {
      var c = el("article", "card");
      var ul = el("ul");
      A(s.specs).forEach(function (x) { ul.append(el("li", null, t(x))); });
      c.append(
        el("h3", null, t(s.name)),
        el("p", null, t(s.desc)),
        el("h4", null, t(S.ui.labels.audience)),
        el("p", "audience", t(s.audience)),
        el("h4", null, t(S.ui.labels.includes)),
        ul
      );
      return c;
    }));

    // 服務流程
    fill($("stepList"), A(S.process.steps).map(function (s) {
      var li = el("li");
      if (s.image) {
        var img = el("img", "step-img");
        img.src = src(s.image);
        img.alt = t(s.name);
        img.loading = "lazy";
        li.append(img);
        li.classList.add("has-img");
      }
      li.append(el("h3", null, t(s.name)), el("p", null, t(s.desc)));
      return li;
    }));

    renderCases();

    // FAQ
    fill($("faqList"), A(S.faq.items).map(function (f) {
      var d = el("details");
      d.append(el("summary", null, t(f.q)), el("p", null, t(f.a)));
      return d;
    }));

    renderFormOptions();
    renderContact();

    $("copyright").textContent =
      "© " + new Date().getFullYear() + " " + t(S.brand.fullName) + " " + t(S.ui.labels.rights);
  }

  function setImg(img, path, alt) {
    img.hidden = !path;
    if (!path) { img.removeAttribute("src"); return; }
    if (img.getAttribute("src") !== src(path)) img.src = src(path);
    img.alt = alt || "";
    img.loading = "lazy";
  }

  function showSection(id, visible) {
    $(id).hidden = !visible;
    document.querySelectorAll('#nav a[href="#' + id + '"]').forEach(function (a) { a.hidden = !visible; });
  }

  function renderCases() {
    var cats = [];
    A(S.cases.items).forEach(function (c) {
      if (!cats.some(function (x) { return x.zh === c.category.zh; })) cats.push(c.category);
    });

    function filterBtn(label, key) {
      var b = el("button", "filter", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(activeFilter === key));
      b.addEventListener("click", function () { activeFilter = key; renderCases(); });
      return b;
    }
    fill($("caseFilters"), [filterBtn(t(S.ui.labels.all), null)].concat(
      cats.map(function (c) { return filterBtn(t(c), c.zh); })
    ));

    var shown = A(S.cases.items).filter(function (c) {
      return activeFilter === null || c.category.zh === activeFilter;
    });
    fill($("caseList"), shown.map(function (c) {
      var card = el("article", "case");
      var pic = el("div", "case-img");
      if (c.image) {
        var img = el("img");
        img.src = src(c.image);
        img.alt = t(c.title);
        img.loading = "lazy";
        pic.append(img);
      } else {
        pic.textContent = String(S.cases.items.indexOf(c) + 1).padStart(2, "0");
        pic.setAttribute("aria-hidden", "true");
      }
      var body = el("div", "case-body");
      body.append(
        el("span", "tag", t(c.category)),
        el("h3", null, t(c.title)),
        el("p", "client", t(S.ui.labels.client) + (lang === "zh" ? "：" : ": ") + t(c.client)),
        el("p", "result", t(c.result))
      );
      card.append(pic, body);
      return card;
    }));
  }

  function renderFormOptions() {
    function options(select, values, labels) {
      var keep = select.value;
      var first = el("option", null, t(S.ui.form.choose));
      first.value = "";
      fill(select, [first].concat(values.map(function (v, i) {
        var o = el("option", null, labels ? labels[i] : v);
        o.value = v;
        return o;
      })));
      select.value = keep;
    }
    // value 一律用中文名稱，切換語言時已選項目不會跑掉
    options($("f-service"),
      A(S.services.items).map(function (s) { return s.name.zh; }),
      A(S.services.items).map(function (s) { return t(s.name); }));
    options($("f-time"), A(S.booking.slots));
  }

  function renderContact() {
    var c = S.contact, L = S.ui.labels, rows = [];
    function row(label, node) { rows.push(el("dt", null, t(label)), node); }
    function link(href, text) {
      var dd = el("dd"), a = el("a", null, text);
      a.href = href;
      dd.append(a);
      return dd;
    }
    if (c.phone) row(L.phone, link("tel:" + c.phone.replace(/[^\d+]/g, ""), c.phone));
    if (c.fax) row(L.fax, el("dd", null, c.fax));
    if (c.email) row(L.email, link("mailto:" + c.email, c.email));
    var addr = el("dd", null, t(c.address));
    if (c.mapUrl) {
      var m = el("a", null, t(L.map));
      m.href = c.mapUrl; m.target = "_blank"; m.rel = "noopener";
      addr.append(el("br"), m);
    }
    row(L.address, addr);
    if (t(c.hours)) row(L.hours, el("dd", null, t(c.hours)));
    fill($("contactList"), rows);
  }

  /* ---------- 預約表單 ---------- */
  function setupForm() {
    var form = $("bookingForm"), msg = $("formMsg"), btn = $("submitBtn");

    // 只能選今天以後的日期
    var now = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    $("f-date").min = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

    function say(text, cls) {
      msg.textContent = t(text);
      msg.className = "form-msg" + (cls ? " " + cls : "");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null, emailBad = false;
      Array.prototype.forEach.call(form.elements, function (f) {
        if (!f.name) return;
        var bad = !f.checkValidity();
        f.classList.toggle("invalid", bad);
        if (bad && !firstBad) firstBad = f;
        if (bad && f.type === "email" && f.value.trim()) emailBad = true;
      });
      if (firstBad) {
        say(emailBad ? S.ui.form.badEmail : S.ui.form.required, "err");
        firstBad.focus();
        return;
      }

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });

      if (!S.booking.endpoint) {
        // 沒有設定表單服務：改用訪客的郵件軟體寄出
        var F = S.ui.form;
        var lines = [
          t(F.name) + ": " + data.name,
          t(F.company) + ": " + data.company,
          t(F.phone) + ": " + data.phone,
          t(F.email) + ": " + data.email,
          t(F.service) + ": " + data.service,
          t(F.date) + ": " + data.date + " " + data.time,
          "",
          data.notes
        ];
        var subject = t(S.bookingSection.title) + " - " + data.name + " " + data.date + " " + data.time;
        window.location.href = "mailto:" + S.contact.email +
          "?subject=" + encodeURIComponent(subject) +
          "&body=" + encodeURIComponent(lines.join("\n"));
        say(F.okMail, "ok");
        return;
      }

      btn.disabled = true;
      say(S.ui.form.sending);
      fetch(S.booking.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        form.reset();
        say(S.ui.form.okSent, "ok");
      }).catch(function () {
        say(S.ui.form.fail, "err");
      }).then(function () {
        btn.disabled = false;
      });
    });
  }

  /* ---------- 啟動 ---------- */
  $("langBtn").addEventListener("click", function () {
    lang = lang === "zh" ? "en" : "zh";
    try { localStorage.setItem("lang", lang); } catch (e) {}
    $("formMsg").textContent = "";
    render();
  });

  var nav = $("nav"), toggle = $("navToggle");
  toggle.addEventListener("click", function () {
    toggle.setAttribute("aria-expanded", String(nav.classList.toggle("open")));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  Promise.all(FILES.map(function (name) {
    return fetch("content/" + name + ".json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(name + ".json: HTTP " + r.status);
      return r.json();
    });
  })).then(function (parts) {
    S = {};
    FILES.forEach(function (name, i) {
      if (name === "settings") Object.assign(S, parts[i]);
      else S[name] = parts[i];
    });
    if (S.brand.color) document.documentElement.style.setProperty("--brand", S.brand.color);
    if (S.brand.colorDark) document.documentElement.style.setProperty("--brand-dark", S.brand.colorDark);
    render();
    setupForm();
  }).catch(function (err) {
    console.error(err);
    var box = el("p", null,
      "內容載入失敗。若您是直接點兩下開啟 index.html，請改用 preview.bat 啟動本機預覽。 / " +
      "Content failed to load. If you opened index.html directly, run preview.bat instead.");
    box.style.cssText = "max-width:640px;margin:120px auto;padding:0 20px;text-align:center";
    $("main").replaceChildren(box);
  });
})();
