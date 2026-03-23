// ===== CONFIG =====
// ใส่ Spreadsheet ID ของคุณที่นี่
var SS_ID = '1_AMqU-3OFOtysDYxHyAlwirtaJBN3DsP50HIsv7ih1k';

var _ss = null;
function getSS() {
  if (!_ss) _ss = SpreadsheetApp.openById(SS_ID);
  return _ss;
}

// ===== WEB APP ENTRY POINTS =====
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Doc Handover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;
    if      (action === 'getUsers')    result = getUsers();
    else if (action === 'verifyPin')   result = verifyPin(data);
    else if (action === 'changePin')   result = changePin(data);
    else if (action === 'getPlans')    result = getPlans(data);
    else if (action === 'createPlan')  result = createPlan(data);
    else if (action === 'getDocs')     result = getDocs(data);
    else if (action === 'receipt')     result = receipt(data);
    else if (action === 'login')       result = login(data);
    else result = { error: 'Unknown action: ' + action };
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== HELPERS =====
function sha256(str) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return b.map(function(x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}
function getSheet(name) {
  return getSS().getSheetByName(name);
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

// ===== ACTIONS =====
function getUsers() {
  var ga  = sheetToObjects(getSheet('GA_Staff')).map(function(r) {
    return { name: r.name, role: r.role };
  });
  var mgr = sheetToObjects(getSheet('Managers')).map(function(r) {
    return { name: r.name, role: r.role };
  });
  return { ga: ga, mgr: mgr };
}

function verifyPin(data) {
  var sheet = data.role === 'ga' ? getSheet('GA_Staff') : getSheet('Managers');
  var rows  = sheetToObjects(sheet);
  var user  = rows.filter(function(r) { return r.name === data.name; })[0];
  if (!user) return { ok: false };
  var stored = String(user.pin);
  var match = stored === String(data.pin) || sha256(stored) === String(data.pin);
  return { ok: match };
}

function changePin(data) {
  var sheet   = data.role === 'ga' ? getSheet('GA_Staff') : getSheet('Managers');
  var vals    = sheet.getDataRange().getValues();
  var headers = vals[0];
  var pinCol  = headers.indexOf('pin');
  var nameCol = headers.indexOf('name');
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][nameCol] === data.name) {
      sheet.getRange(i + 1, pinCol + 1).setValue(data.newPin);
      return { ok: true };
    }
  }
  return { ok: false };
}

function login(data) {
  var verify = verifyPin(data);
  if (!verify.ok) return { ok: false };
  var plans = getPlans(data);
  return { ok: true, plans: plans };
}

function getPlans(data) {
  var rows = sheetToObjects(getSheet('Plans'));
  if (data.role === 'ga') {
    rows = rows.filter(function(r) { return r.created_by === data.name; });
  }
  rows = rows.reverse(); // newest first
  return rows.map(function(r) {
    return {
      plan_id:    r.plan_id,
      name:       r.name,
      date:       r.date,
      dept:       r.dept,
      created_by: r.created_by,
      status:     r.status,
      signer:     r.signer     || '',
      sign_img:   r.sign_img   || '',
      signed_at:  r.signed_at  || ''
    };
  });
}

function createPlan(data) {
  var planId    = 'P' + Date.now();
  var planSheet = getSheet('Plans');
  planSheet.appendRow([planId, data.name, data.date, data.dept, data.created_by, 'ready', '', '', '']);

  var docSheet = getSheet('Documents');
  (data.docs || []).forEach(function(doc) {
    var docId = 'D' + Date.now() + Math.random().toString(36).substr(2, 5);
    docSheet.appendRow([docId, planId, doc.no, doc.vendor || '', doc.desc || '', doc.amount || 0, 'false']);
  });

  return { ok: true, plan_id: planId };
}

function getDocs(data) {
  var rows = sheetToObjects(getSheet('Documents'));
  return rows
    .filter(function(r) { return r.plan_id === data.plan_id; })
    .map(function(r) {
      return {
        doc_id:      r.doc_id,
        plan_id:     r.plan_id,
        doc_no:      r.doc_no,
        vendor:      r.vendor,
        description: r.description,
        amount:      Number(r.amount) || 0,
        is_received: String(r.is_received)
      };
    });
}

function receipt(data) {
  // อัปเดต Plans
  var planSheet = getSheet('Plans');
  var planVals  = planSheet.getDataRange().getValues();
  var pH        = planVals[0];
  var pIdC      = pH.indexOf('plan_id');
  var stC       = pH.indexOf('status');
  var sigC      = pH.indexOf('signer');
  var imgC      = pH.indexOf('sign_img');
  var tsC       = pH.indexOf('signed_at');
  for (var i = 1; i < planVals.length; i++) {
    if (planVals[i][pIdC] === data.plan_id) {
      planVals[i][stC]  = data.status;
      planVals[i][sigC] = data.signer;
      planVals[i][imgC] = data.sign_img || '';
      planVals[i][tsC]  = data.signed_at;
      planSheet.getRange(i + 1, 1, 1, planVals[i].length).setValues([planVals[i]]);
      break;
    }
  }

  // อัปเดต Documents
  var docSheet = getSheet('Documents');
  var docVals  = docSheet.getDataRange().getValues();
  var dH       = docVals[0];
  var dPIdC    = dH.indexOf('plan_id');
  var dNoC     = dH.indexOf('doc_no');
  var rcvC     = dH.indexOf('is_received');
  var map = {};
  (data.checked || []).forEach(function(c) { map[c.no] = c.received; });
  var docChanged = false;
  for (var j = 1; j < docVals.length; j++) {
    if (docVals[j][dPIdC] === data.plan_id) {
      var no = docVals[j][dNoC];
      if (no in map) {
        docVals[j][rcvC] = String(map[no]);
        docChanged = true;
      }
    }
  }
  if (docChanged) {
    docSheet.getRange(1, 1, docVals.length, docVals[0].length).setValues(docVals);
  }

  return { ok: true };
}