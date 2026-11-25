/**
 * 清泰源網站後端（Google Apps Script，免費）
 * 功能：
 *   1. 接收網站「預約諮詢」表單 → 寫入試算表「聯絡紀錄」分頁（狀態：待確認）
 *   2. 後台 admin.html 確認後寄出確認信給客戶 → 狀態改為「已確認」
 *   3. 計算每日瀏覽人次 → 寫入「瀏覽人次」分頁，網站頁尾顯示今日人次
 *
 * 設定方式請看同資料夾的 README.md。
 * 密碼與信箱存放在「專案設定 → 指令碼屬性」，不要寫在這個檔案裡：
 *   ADMIN_PASSWORD  後台登入密碼（必填）
 *   NOTIFY_EMAIL    有新預約時寄通知信到這個信箱（選填）
 *   SENDER_NAME     寄給客戶的確認信顯示的寄件人名稱（選填，預設為公司名稱）
 */

var TZ = "Asia/Taipei";
var CONTACT_SHEET = "聯絡紀錄";
var VISIT_SHEET = "瀏覽人次";
var FIELDS = [
  ["name", "姓名"], ["company", "公司"], ["phone", "電話"], ["email", "電子郵件"],
  ["service", "想了解的產品"], ["date", "希望日期"], ["time", "希望時段"], ["notes", "需求說明"]
];
var CONTACT_HEADERS = ["送出時間"].concat(FIELDS.map(function (f) { return f[1]; }))
  .concat(["狀態", "確認時間", "確認方式", "編號"]);
var PENDING = "待確認", CONFIRMED = "已確認";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "count";
  if (action === "hit" || action === "count") {
    return json_({ ok: true, date: today_(), count: visits_(action === "hit") });
  }
  return json_({ ok: false, error: "unknown action" });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad request" }); }
  if (body.action === "list" || body.action === "confirm") {
    if (!authorized_(body)) {
      Utilities.sleep(1500); // 拖慢暴力猜密碼
      return json_({ ok: false, error: "auth" });
    }
    return body.action === "list" ? list_() : confirm_(body);
  }
  return submit_(body);
}

/* ---------- 網站表單送出 ---------- */
function submit_(b) {
  if (!str_(b.name)) return json_({ ok: false, error: "missing name" });
  var values = FIELDS.map(function (f) { return str_(b[f[0]]); });
  var row = [now_()].concat(values).concat([PENDING, "", "", Utilities.getUuid()]);
  withLock_(function () { contactSheet_().appendRow(row); });

  var to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (to) {
    try {
      MailApp.sendEmail({
        to: to,
        subject: "網站新預約：" + values[0] + " " + values[5] + " " + values[6],
        body: "送出時間：" + row[0] + "\n" +
          FIELDS.map(function (f, i) { return f[1] + "：" + values[i]; }).join("\n") +
          "\n\n請到網站後台 admin.html 確認並寄出確認信。",
        replyTo: /@/.test(values[3]) ? values[3] : undefined
      });
    } catch (err) { /* 通知信失敗不影響紀錄 */ }
  }
  return json_({ ok: true });
}

/* ---------- 後台：讀取紀錄 ---------- */
function list_() {
  var contacts = withLock_(function () {
    var sh = contactSheet_();
    var t = table_(sh);
    // 舊資料沒有編號／狀態時補上，之後才能逐筆確認
    var idCol = t.headers.indexOf("編號"), stCol = t.headers.indexOf("狀態");
    t.rows.forEach(function (r, i) {
      if (!r[idCol]) { r[idCol] = Utilities.getUuid(); sh.getRange(i + 2, idCol + 1).setValue(r[idCol]); }
      if (!r[stCol]) { r[stCol] = PENDING; sh.getRange(i + 2, stCol + 1).setValue(PENDING); }
    });
    return t;
  });
  return json_({ ok: true, contacts: contacts, visits: table_(sheet_(VISIT_SHEET, ["日期", "人次"])) });
}

/* ---------- 後台：確認預約（可同時寄確認信給客戶） ---------- */
function confirm_(b) {
  var send = b.send !== false;
  var to = str_(b.to), subject = str_(b.subject), body = String(b.body || "").slice(0, 20000);
  if (send && (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to) || !subject || !body.trim())) {
    return json_({ ok: false, error: "收件人、主旨或內容不完整" });
  }
  return withLock_(function () {
    var sh = contactSheet_();
    var t = table_(sh);
    var idCol = t.headers.indexOf("編號");
    var i = t.rows.findIndex(function (r) { return r[idCol] && r[idCol] === b.id; });
    if (i < 0) return json_({ ok: false, error: "找不到這筆紀錄，請重新整理後再試" });

    if (send) {
      var name = PropertiesService.getScriptProperties().getProperty("SENDER_NAME") || "清泰源實業股份有限公司";
      try {
        MailApp.sendEmail({ to: to, subject: subject, body: body, name: name });
      } catch (err) {
        return json_({ ok: false, error: "寄信失敗：" + err.message });
      }
    }
    var rowNo = i + 2, h = t.headers;
    sh.getRange(rowNo, h.indexOf("狀態") + 1).setValue(CONFIRMED);
    sh.getRange(rowNo, h.indexOf("確認時間") + 1).setValue(now_());
    sh.getRange(rowNo, h.indexOf("確認方式") + 1).setValue(send ? "已寄確認信至 " + to : "未寄信（手動標記）");
    return json_({ ok: true, remainingQuota: MailApp.getRemainingDailyQuota() });
  });
}

/* ---------- 瀏覽人次 ---------- */
function visits_(increment) {
  return withLock_(function () {
    var sh = sheet_(VISIT_SHEET, ["日期", "人次"]);
    var d = today_(), last = sh.getLastRow();
    if (last > 1) {
      var v = sh.getRange(last, 1, 1, 2).getDisplayValues()[0];
      if (v[0] === d) {
        var n = Number(v[1]) || 0;
        if (increment) sh.getRange(last, 2).setValue(String(++n));
        return n;
      }
    }
    if (!increment) return 0;
    sh.appendRow([d, "1"]);
    return 1;
  });
}

/* ---------- 工具 ---------- */
function authorized_(b) {
  var pw = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  return !!pw && String(b.password || "") === pw;
}

// 聯絡紀錄分頁；舊版試算表缺少的欄位（狀態、編號…）會自動加在最右邊
function contactSheet_() {
  var sh = sheet_(CONTACT_SHEET, CONTACT_HEADERS);
  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0];
  CONTACT_HEADERS.forEach(function (h) {
    if (have.indexOf(h) < 0) {
      var col = have.filter(String).length + 1;
      sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat("@");
      sh.getRange(1, col).setValue(h);
      have[col - 1] = h;
    }
  });
  return sh;
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat("@"); // 全部存成文字：電話開頭的 0 不會消失
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function table_(sh) {
  var values = sh.getDataRange().getDisplayValues();
  return { headers: values[0] || [], rows: values.slice(1) };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// 限制長度；以 = 開頭的內容前面加 ' 避免被試算表當成公式
function str_(v) {
  var s = String(v == null ? "" : v).trim().slice(0, 2000);
  return s.charAt(0) === "=" ? "'" + s : s;
}

function today_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
