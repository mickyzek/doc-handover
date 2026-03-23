// ===== CONFIG =====
// คัดลอก URL และ Anon Key จากหน้า Supabase Dashboard > Settings > API
const SUPABASE_URL = 'https://npxbjktnxqycmifyrwrb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LbcwYbfDXmBrRJ6lFe9eHQ_mK3oNyL1'; 

/**
 * ฟังก์ชันสำหรับย้ายข้อมูลจาก Google Sheets ไปยัง Supabase
 * วิธีใช้: คัดลอกโค้ดทั้งหมดนี้ไปวางใน Google Apps Script Editor แล้วกด "เรียกใช้" (Run) ที่ฟังก์ชัน migrateData
 */
function migrateData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log("เริ่มการย้ายข้อมูล...");

  // 1. ย้ายรายชื่อพนักงาน GA
  migrateTable(ss, 'GA_Staff', 'ga_staff', r => ({
    name: r.name,
    pin: String(r.pin),
    role: r.role || 'ga'
  }));
  
  // 2. ย้ายรายชื่อผู้จัดการ
  migrateTable(ss, 'Managers', 'managers', r => ({
    name: r.name,
    pin: String(r.pin),
    role: r.role || 'mgr'
  }));
  
  // 3. ย้ายข้อมูลแผนงาน (Plans)
  migrateTable(ss, 'Plans', 'plans', r => ({
    p_id: r.plan_id,
    name: r.name,
    date: r.date instanceof Date ? Utilities.formatDate(r.date, "GMT+7", "yyyy-MM-dd") : r.date,
    dept: r.dept,
    created_by: r.created_by,
    status: r.status,
    signer: r.signer || '',
    sign_img: r.sign_img || '',
    signed_at: String(r.signed_at || '')
  }));
  
  // 4. ย้ายข้อมูลเอกสาร (Documents)
  migrateTable(ss, 'Documents', 'documents', r => ({
    d_id: r.doc_id,
    p_id: r.plan_id,
    doc_no: String(r.doc_no),
    vendor: r.vendor || '',
    description: r.description || '',
    amount: Number(r.amount) || 0,
    is_received: String(r.is_received).toLowerCase() === 'true'
  }));
  
  Logger.log("การย้ายข้อมูลเสร็จสิ้น!");
  Browser.msgBox("การย้ายข้อมูลเสร็จสิ้น! กรุณาตรวจสอบข้อมูลใน Supabase");
}

/**
 * ฟังก์ชันช่วยในการย้ายข้อมูลทีละตาราง
 */
function migrateTable(ss, sheetName, tableName, mapper) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log("❌ ไม่พบแผ่นงาน: " + sheetName);
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("⚠️ ไม่มีข้อมูลใน: " + sheetName);
    return;
  }

  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return mapper(obj);
  });
  
  // ส่งข้อมูลไปที่ Supabase REST API
  const url = SUPABASE_URL + '/rest/v1/' + tableName;
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'resolution=merge-duplicates' 
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  };
  
  try {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log("✅ ย้ายข้อมูล " + sheetName + " สำเร็จ (" + rows.length + " รายการ)");
    } else {
      Logger.log("❌ เกิดข้อผิดพลาดใน " + sheetName + ": " + res.getContentText());
    }
  } catch (e) {
    Logger.log("❌ ไม่สามารถเชื่อมต่อกับ Supabase สำหรับ " + sheetName + ": " + e.message);
  }
}
