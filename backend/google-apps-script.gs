/**
 * 清泰源網站後端（Google Apps Script，免費）
 * 功能：
 *   1. 接收網站「預約諮詢」表單 → 寫入試算表「聯絡紀錄」分頁（永久保存）
 *   2. 計算每日瀏覽人次 → 寫入「瀏覽人次」分頁，網站頁尾顯示今日人次
 *   3. 提供 admin.html 後台讀取紀錄（需密碼），可匯出 Excel
 *
 * 設定方式請看同資料夾的 README.md。
 * 密碼與通知信箱存放在「專案設定 → 指令碼屬性」，不要寫在這個檔案裡：
 *   ADMIN_PASSWORD  後台登入密碼（必填）
 *   NOTIFY_EMAIL    有新預約時寄通知信到這個信箱（選填）
 */

var TZ = "Asia/Taipei";
var CONTACT_SHEET = "聯絡紀錄";
var VISIT_SHEET = "瀏覽人次";
var FIELDS = [
  ["name", "姓名"], ["company", "公司"], ["phone", "電話"], ["email", "電子郵件"],
  ["service", "想了解的產品"], ["date", "希望日期"], ["time", "希望時段"], ["notes", "需求說明"]
];

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
  if (body.action === "list") return list_(body);
  return submit_(body);
}

/* ---------- 表單送出 ---------- */
function submit_(b) {
  if (!str_(b.name)) return json_({ ok: false, error: "missing name" });
  var row = [now_()].concat(FIELDS.map(function (f) { return str_(b[f[0]]); }));
  withLock_(function () {
    sheet_(CONTACT_SHEET, ["送出時間"].concat(FIELDS.map(function (f) { return f[1]; }))).appendRow(row);
  });

  var to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (to) {
    var lines = FIELDS.map(function (f, i) { return f[1] + "：" + row[i + 1]; });
    try {
      MailApp.sendEmail({
        to: to,
        subject: "網站新預約：" + row[1] + " " + row[6] + " " + row[7],
        body: "送出時間：" + row[0] + "\n" + lines.join("\n"),
        replyTo: /@/.test(row[4]) ? row[4] : undefined
      });
    } catch (err) { /* 通知信失敗不影響紀錄 */ }
  }
  return json_({ ok: true });
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

/* ---------- 後台讀取 ---------- */
function list_(b) {
  var pw = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!pw || String(b.password || "") !== pw) {
    Utilities.sleep(1500); // 拖慢暴力猜密碼
    return json_({ ok: false, error: "auth" });
  }
  return json_({
    ok: true,
    contacts: table_(sheet_(CONTACT_SHEET, ["送出時間"].concat(FIELDS.map(function (f) { return f[1]; })))),
    visits: table_(sheet_(VISIT_SHEET, ["日期", "人次"]))
  });
}

/* ---------- 工具 ---------- */
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
