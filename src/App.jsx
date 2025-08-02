// MaintenanceEditor with robust date parsing

import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { differenceInDays, parse } from "date-fns";
import PropTypes from "prop-types";
import { DataGrid } from '@mui/x-data-grid';

const CLIENT_ID = "412097983726-bs860lb09slcgtiuoetqvoq54jtqn1h1.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const SPREADSHEET_ID = "1v4rQWn6dYPVQPd-PkhvrDNgKVnexilrR2XIUVa5RKEM";
const SHEET_NAME = "Sheet1";

function btnStyle(color) {
  return { background: color, color: "white", padding: "6px 10px", fontSize: "13px", borderRadius: 8, border: "none", fontWeight: "bold" };
}

function normalizePlate(plate) {
  return plate?.trim().toLowerCase().replace(/\s+/g, "") || "";
}

async function updateSheetCell(spreadsheetId, range, value) {
  const accessToken = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[value]] }),
    }
  );
}

// دالة لتصفية الأعمدة التي بها بيانات فقط
function filterColumnsWithData(rows) {
  if (!rows.length) return rows;
  const keys = Object.keys(rows[0]);
  // استثني Index وDays Delayed من الفحص
  const dataKeys = keys.filter(k => k !== "Index" && k !== "Days Delayed");
  const columnsWithData = dataKeys.filter(key => rows.some(row => row[key] && row[key].toString().trim() !== ""));
  return rows.map(row => {
    const filtered = { Index: row.Index };
    columnsWithData.forEach(key => { filtered[key] = row[key]; });
    filtered["Days Delayed"] = row["Days Delayed"];
    return filtered;
  });
}

export default function MaintenanceEditor() {
  
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [modifiedData, setModifiedData] = useState([]);
  const [editCell, setEditCell] = useState(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [duplicatePlates, setDuplicatePlates] = useState({});
  const [invygoPlates, setInvygoPlates] = useState([]);
  const [duplicateRows, setDuplicateRows] = useState({});
  const tableRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [sheetError, setSheetError] = useState(null);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [gapiError, setGapiError] = useState(null);

  useEffect(() => {
    const fetchInvygoPlates = async () => {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1sHvEQMtt3suuxuMA0zhcXk5TYGqZzit0JvGLk1CQ0LI/export?format=csv&gid=1812913588");
      const text = await response.text();
      const rows = text.split("\n").map(r => r.split(","));
      const plates = rows.slice(1).map(r => r[0]?.trim().replace(/\s+/g, "").toLowerCase()).filter(Boolean);
      setInvygoPlates(plates);
    };
    fetchInvygoPlates();
  }, []);

  useEffect(() => {
    setLoading(true);
    setSheetError(null);
    const fetchSheet = async () => {
      try {
        const response = await fetch("https://docs.google.com/spreadsheets/d/1v4rQWn6dYPVQPd-PkhvrDNgKVnexilrR2XIUVa5RKEM/export?format=csv&gid=0");
        const text = await response.text();
        const rows = text.split("\n").map(r => r.split(","));
        const headers = rows[0];
        const parsed = rows.slice(1).map(r => Object.fromEntries(r.map((v, i) => [headers[i], v])));
        setData(parsed);
        setModifiedData(parsed);
      } catch (err) {
        setSheetError("حدث خطأ أثناء تحميل البيانات!");
      } finally {
        setLoading(false);
      }
    };
    fetchSheet();
  }, []);

  useEffect(() => {
    const counts = {};
    const rowMap = {};
    modifiedData.forEach((row, idx) => {
      const plate = normalizePlate(row["Vehicle"]);
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
      const hasDateIn = dateInKey && row[dateInKey]?.trim() !== "";
      if (plate && !hasDateIn) {
        counts[plate] = (counts[plate] || 0) + 1;
        rowMap[plate] = rowMap[plate] || [];
        rowMap[plate].push(idx + 1);
      }
    });
    setDuplicatePlates(Object.fromEntries(Object.entries(counts).filter(([_, c]) => c > 1)));
    setDuplicateRows(rowMap);
  }, [modifiedData]);

  const today = new Date();

  const parseDate = (str) => {
  if (!str || typeof str !== "string") return new Date("Invalid");
  const formats = ["dd/MM/yyyy", "d-M-yyyy", "dd-MM-yyyy", "yyyy-MM-dd"];
  for (const format of formats) {
    const parsed = parse(str, format, new Date());
    if (!isNaN(parsed)) return parsed;
  }
  const fallback = new Date(str);
  return isNaN(fallback) ? new Date("Invalid") : fallback;
};

  function getDisplayRows(rows) {
    return rows.map((row, i) => {
      const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
      const dateOutStr = dateOutKey && row[dateOutKey];
      const dateInStr = dateInKey && row[dateInKey];
      let daysPassed = "";
      let showDelay = false;
      if (dateOutStr && (!dateInStr || dateInStr.trim() === "")) {
        const dateOut = parseDate(dateOutStr);
        if (!isNaN(dateOut)) {
          const days = differenceInDays(new Date(), dateOut);
          const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
          const damage = damageKey && row[damageKey]?.toLowerCase();
          // استثناء total loss
          if (damage?.includes("total loss")) {
            daysPassed = "";
          } else {
            // حساب كل المدد المطلوبة
            let requiredDays = [];
            if (damage?.includes("oil")) requiredDays.push(3);
            if (damage?.includes("accident")) requiredDays.push(30);
            if (!damage?.includes("oil") && !damage?.includes("accident")) requiredDays.push(3);
            // استخدم المدة الأكبر
            const maxRequired = requiredDays.length ? Math.max(...requiredDays) : 3;
            if (days > maxRequired) daysPassed = days; else daysPassed = "";
          }
        }
      }
      return {
        Index: i + 1,
        ...row,
        "Days Delayed": daysPassed
      };
    });
  }

  let filtered = [];
  if (search.trim() !== "") {
    // البحث يعمل على كل البيانات بغض النظر عن الفلتر
    const baseRows = modifiedData.filter(row =>
      Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes(search.toLowerCase()))
    );
    filtered = getDisplayRows(baseRows).map((row, i) => ({ ...row, Index: i + 1 }));
  } else if (filterMode === "delayed") {
    const delayedRows = getDisplayRows(modifiedData).filter(row => row["Days Delayed"] !== "");
    filtered = delayedRows.map((row, i) => ({ ...row, Index: i + 1 }));
  } else if (filterMode === "totalloss") {
    // فلترة الصفوف التي تحتوي على 'total loss' في أي عمود
    const totalLossRows = modifiedData.filter(row =>
      Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes('total loss'))
    );
    filtered = getDisplayRows(totalLossRows).map((row, i) => ({ ...row, Index: i + 1 }));
  } else {
    // فلترة حسب الفلتر المختار
    const baseRows = modifiedData.filter(row => {
      const vehicle = row["Vehicle"]?.trim();
      if (!vehicle || vehicle === "#N/A" || vehicle === "") return false;
      // استبعاد الصفوف التي كل أعمدتها (عدا Vehicle) فارغة أو #N/A
      const dataKeys = Object.keys(row).filter(k => k !== "Vehicle");
      const hasUsefulData = dataKeys.some(k => {
        const v = row[k]?.trim();
        return v && v !== "#N/A";
      });
      if (!hasUsefulData) return false;
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
      const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
      const damageText = damageKey && row[damageKey]?.toLowerCase();
      const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
      const plate = normalizePlate(row["Vehicle"]);
      if (filterMode === "accident") return damageText?.includes("accident") && !hasDate;
      if (filterMode === "invygo") return plate && invygoPlates.includes(plate) && !hasDate;
      if (filterMode === "ready") return hasDate;
      if (filterMode === "notready") {
        const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
        const hasDateOut = dateOutKey && row[dateOutKey]?.trim() !== "";
        // استبعاد الصفوف التي تحتوي على 'total loss' في أي عمود
        const hasTotalLoss = Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes('total loss'));
        return hasDateOut && !hasDate && !hasTotalLoss;
      }
      if (filterMode === "duplicates") {
        if (!plate || !duplicatePlates[plate]) return false;
        const dateIn = dateInKey && row[dateInKey]?.trim();
        return !dateIn;
      }
      return true;
    });
    // أعد الترقيم بعد الفلترة
    filtered = getDisplayRows(baseRows).map((row, i) => ({ ...row, Index: i + 1 }));
  }

  // دالة توليد الملاحظة لكل صف
  function getNote(row, rowIndex = 0) {
    console.log('getNote input:', row, rowIndex);
    const plate = normalizePlate(row["Vehicle"]);
    const carType = invygoPlates.includes(plate) ? "Invygo" : "Yelo";
    let status = "";
    if (row["Days Delayed"]) status = "Delayed";
    else {
      const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
      const damageText = damageKey && row[damageKey]?.toLowerCase();
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
      const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
      if (damageText?.includes("accident")) status = "Accident";
      else if (hasDate) status = "Repaired";
      else status = "Not Repaired";
    }
    if (plate && duplicatePlates[plate]) {
      const rows = duplicateRows[plate] || [];
      const others = rows.filter(n => n !== rowIndex + 1);
      if (others.length > 0) {
        status += `, Duplicate with rows: ${others.join(", ")}`;
      }
    }
    return `${carType} ${status}`;
  }

  // دوال التصدير
  const exportToExcel = () => {
    let fileName = "Maintenance";
    if (search.trim() !== "") {
      fileName = "search";
    } else if (filterMode === "delayed") fileName = "Delayed";
    else if (filterMode === "duplicates") fileName = "Duplicates";
    else if (filterMode === "accident") fileName = "Accident";
    else if (filterMode === "invygo") fileName = "Invygo";
    else if (filterMode === "notready") fileName = "NotReady";
    else if (filterMode === "ready") fileName = "Ready";
    // أضف عمود Notes لكل صف
    const exportRows = filterColumnsWithData(filtered.map((row, i) => ({ ...row, Notes: getNote(row, i) })));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, fileName);
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getRowStyle = (row) => {
    if (row["Days Delayed"]) return { backgroundColor: "#ff7043", color: "#fff" };
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
    const dateIn = dateInKey && row[dateInKey]?.trim();
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const plate = normalizePlate(row["Vehicle"]);

    const isInvygo = invygoPlates.includes(plate);
    const isAccident = damageText?.includes("accident") && !dateIn;
    const isReady = Boolean(dateIn);

    if (plate && duplicatePlates[plate]) return { backgroundColor: "#e53935", color: "#fff" };
    if (isInvygo && isReady) return { backgroundColor: "#bbdefb" };
    if (isInvygo && !isReady) return { backgroundColor: "#fff", border: "1px solid #ccc", color: "#6a1b9a" };
    if (!isInvygo && isReady) return { backgroundColor: "#c8e6c9" };
    if (isAccident) return { backgroundColor: "#ffcdd2" };
    if (!isInvygo && !isReady) return { backgroundColor: "#fff9c4", color: "#6a1b9a" };
    return {};
  };

  const handleEdit = async (rowIndex, key, value) => {
    setModifiedData((prev) => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      return updated;
    });
    if (!isSignedIn) return;
    try {
      const colIndex = Object.keys(modifiedData[0]).indexOf(key);
      const colLetter = String.fromCharCode(65 + colIndex); // A, B, C, ...
      const sheetRow = rowIndex + 2; // +2 لأن أول صف هو العناوين
      const range = `${SHEET_NAME}!${colLetter}${sheetRow}`;
      await updateSheetCell(SPREADSHEET_ID, range, value);
    } catch (err) {
      setGapiError("Failed to update Google Sheet. Please try again.");
      console.error("updateSheetCell error", err);
    }
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
    const rowCount = filtered.length;
    const colCount = Object.keys(filtered[0] || {}).length;
    let nextRow = rowIndex;
    let nextCol = colIndex;
    if (e.key === "ArrowRight" && colIndex < colCount - 1) nextCol++;
    if (e.key === "ArrowLeft" && colIndex > 0) nextCol--;
    if (e.key === "ArrowUp" && rowIndex > 0) nextRow--;
    if (e.key === "ArrowDown" && rowIndex < rowCount - 1) nextRow++;
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const next = tableRef.current?.querySelector(`input[data-row='${nextRow}'][data-col='${nextCol}']`);
      if (next) next.focus();
    }
    if (e.key === "Enter") e.target.blur();
  };

  const accidentCount = modifiedData.filter(row => {
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
    return damageText?.includes("accident") && !hasDate;
  }).length;

  const invygoCount = modifiedData.filter(row => {
    const plate = normalizePlate(row["Vehicle"]);
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
    return plate && invygoPlates.includes(plate) && !hasDate;
  }).length;

  const notReadyCount = modifiedData.filter(row => {
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
    const hasDateIn = dateInKey && row[dateInKey]?.trim() !== "";
    const hasDateOut = dateOutKey && row[dateOutKey]?.trim() !== "";
    // استبعاد الصفوف التي تحتوي على 'total loss' في أي عمود
    const hasTotalLoss = Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes('total loss'));
    return hasDateOut && !hasDateIn && !hasTotalLoss;
  }).length;

  const duplicatesCount = Object.values(duplicatePlates).reduce((a, b) => a + b, 0);
  const delayedCount = getDisplayRows(modifiedData).filter(row => row["Days Delayed"] !== "").length;

  // حساب عدد كل الصفوف الحقيقية (بدون فلتر، لكن مع استبعاد الفارغ و#N/A)
  const allRowsCount = modifiedData.filter(row => {
    const vehicle = row["Vehicle"]?.trim();
    if (!vehicle || vehicle === "#N/A" || vehicle === "") return false;
    const dataKeys = Object.keys(row).filter(k => k !== "Vehicle");
    const hasUsefulData = dataKeys.some(k => {
      const v = row[k]?.trim();
      return v && v !== "#N/A";
    });
    if (!hasUsefulData) return false;
    return true;
  }).length;

  // حساب عدد صفوف Total Loss
  const totalLossCount = modifiedData.filter(row =>
    Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes('total loss'))
  ).length;

  // تحميل gapi وتهيئة OAuth مع معالجة الأخطاء
  useEffect(() => {
    const waitForGapi = () => {
      if (window.gapi) {
        window.gapi.load("client:auth2", async () => {
          try {
            await window.gapi.client.init({
              clientId: CLIENT_ID,
              scope: SCOPES,
            });
            setGapiLoaded(true);
            setGapiError(null);
            const auth = window.gapi.auth2.getAuthInstance();
            setIsSignedIn(auth.isSignedIn.get());
            if (auth.isSignedIn.get()) setGoogleUser(auth.currentUser.get());
            auth.isSignedIn.listen((val) => {
              setIsSignedIn(val);
              setGoogleUser(val ? auth.currentUser.get() : null);
            });
          } catch (err) {
            setGapiError("");
            console.error("gapi init error", err);
          }
        });
      } else {
        setTimeout(waitForGapi, 300);
      }
    };
    waitForGapi();
  }, []);

  const handleSignIn = () => {
    window.gapi.auth2.getAuthInstance().signIn().catch(err => {
      setGapiError("Google Sign-in failed. Please try again.");
      console.error("Google SignIn error", err);
    });
  };

  const handleSignOut = () => {
    window.gapi.auth2.getAuthInstance().signOut();
  };

  // دالة ترجمة اسم العمود للرأس
  function getHeaderLabel(col) {
    if (col === "Index") return "#";
    if (col === "Days Delayed") return "D.Delay";
    return col;
  }

  return (
    <div style={{ padding: 10, fontFamily: "Segoe UI", maxWidth: 1200, margin: "auto", paddingBottom: 40 }}>
      {/* Back to YELO button */}
      <a
        href="https://moalamir52.github.io/Yelo/"
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          backgroundColor: "#ffd600",
          color: "#6a1b9a",
          padding: "10px 20px",
          textDecoration: "none",
          fontWeight: "bold",
          borderRadius: "8px",
          border: "2px solid #6a1b9a",
          fontSize: 28
        }}
        aria-label="رجوع"
      >
        🔙
      </a>

      <div style={{ padding: 20, fontFamily: "Segoe UI" }}>
        <div className="main-title-box" style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 18
        }}>
          <div style={{
            background: "#ffd600",
            border: "2px solid #7c4dff",
            borderRadius: 16,
            boxShadow: "0 6px 24px rgba(106,27,154,0.7)",
            padding: "18px 36px",
            minWidth: 220,
            textAlign: "center"
          }}>
            <h2 className="main-title" style={{
              margin: 0,
              color: "#6a1b9a",
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: 1
            }}>
              🛠 Maintenance 🛠
            </h2>
          </div>
        </div>

        <FilterButtons filterMode={filterMode} setFilterMode={setFilterMode} accidentCount={accidentCount} invygoCount={invygoCount} notReadyCount={notReadyCount} duplicatesCount={duplicatesCount} delayedCount={delayedCount} modifiedData={modifiedData} search={search} setSearch={setSearch} allRowsCount={allRowsCount} totalLossCount={totalLossCount} />
        <ExportButtons exportToExcel={exportToExcel} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 10, color: "#555" }}>✅ Showing {filtered.length} result(s)</div>

      <div
        style={{
          textAlign: "center",
          margin: "18px 0",
          color: "red",
          fontWeight: "bold",
          fontSize: 36,
          letterSpacing: 1,
          textShadow: "0 2px 8px #ffd600",
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={() => setFilterMode("delayed")}
        title="Show only delayed cars"
      >
        🚨 There are {delayedCount} delayed cars in the Showroom!
      </div>

      {/* Responsive Table Container */}
      <div style={{ width: "100%", overflowX: "auto", margin: "0 auto", maxWidth: 1200 }}>
        <MaintenanceTable filtered={filtered} getDisplayRows={getDisplayRows} invygoPlates={invygoPlates} duplicatePlates={duplicatePlates} duplicateRows={duplicateRows} getNote={getNote} />
      </div>
      <style>{`
        body, html, #root {
          overflow: visible !important;
          height: auto !important;
          min-height: 100vh !important;
        }
        :root {
          --main-purple: #6a1b9a;
          --main-yellow: #ffd600;
          --main-green: #4caf50;
          --main-orange: #ff9800;
          --main-red: #f44336;
          --main-blue: #1976d2;
          --main-pink: #9c27b0;
        }
        .MuiDataGrid-row:hover .mui-cell {
          background: #fffde7 !important;
          color: #6a1b9a !important;
          transition: background 0.2s, color 0.2s;
        }
        .row-delayed:hover .mui-cell,
        .row-duplicate:hover .mui-cell {
          filter: brightness(1.08);
          box-shadow: 0 2px 8px #7c4dff;
        }
        .mui-cell {
          border-right: 2px solid #7c4dff !important;
          padding: 8px 4px !important;
        }
        .mui-header {
          border-right: 2px solid #7c4dff !important;
          border-bottom: 3px solid #7c4dff !important;
        }
        @media (max-width: 900px) {
          table { min-width: 600px !important; }
          input { font-size: 12px; }
          .main-title-box h2 { font-size: 22px !important; }
          .mui-cell, .mui-header { font-size: 12px !important; padding: 6px 2px !important; }
        }
        @media (max-width: 600px) {
          .main-title-box > div {
            padding: 10px 8px !important;
            min-width: 120px !important;
          }
          .main-title-box h2 {
            font-size: 16px !important;
            padding: 0 !important;
          }
          .filter-btns-row {
            flex-direction: column !important;
            gap: 6px !important;
            align-items: stretch !important;
          }
          table { min-width: 400px !important; }
          input { font-size: 11px; }
          .mui-cell, .mui-header { font-size: 10px !important; padding: 4px 1px !important; }
        }
        @media (max-width: 400px) {
          .main-title-box > div {
            padding: 6px 2px !important;
            min-width: 80px !important;
          }
          .main-title-box h2 {
            font-size: 12px !important;
          }
          .filter-btns-row button, .filter-btns-row input {
            font-size: 11px !important;
            padding: 4px 4px !important;
          }
          .mui-cell, .mui-header { font-size: 9px !important; padding: 2px 1px !important; }
        }
        /* إخفاء بعض الأعمدة الأقل أهمية على الشاشات الصغيرة */
        @media (max-width: 600px) {
          .MuiDataGrid-columnHeaders [data-field="Notes"],
          .MuiDataGrid-columnHeaders [data-field*="Date"],
          .MuiDataGrid-columnHeaders [data-field*="Days"],
          .MuiDataGrid-columnHeaders [data-field*="Index"] {
            display: none !important;
          }
          .MuiDataGrid-cell[data-field="Notes"],
          .MuiDataGrid-cell[data-field*="Date"],
          .MuiDataGrid-cell[data-field*="Days"],
          .MuiDataGrid-cell[data-field*="Index"] {
            display: none !important;
          }
        }
        /* إعادة تفعيل ألوان تمييز الصفوف المهمة */
        .row-delayed td { background:rgba(240, 173, 153, 0.64) !important; color:rgb(11, 0, 77) !important; }
        .row-duplicate td { background: #e53935 !important; color: #fff !important; }
        .row-invygo-ready td { background: #bbdefb !important; }
        .row-invygo-notready td { background: #fff !important; border: 1px solid #ccc !important; color: #6a1b9a !important; }
        .row-ready td { background: #c8e6c9 !important; }
        .row-accident td { background: #ffcdd2 !important; }
        .row-notready td { background: #fff9c4 !important; color: #6a1b9a !important; }
      `}</style>
      {loading && <div style={{textAlign:'center',margin:'40px 0',fontSize:22,color:'var(--main-purple)'}} aria-label="Loading data">⏳ Loading data...</div>}
      {sheetError && <div style={{color:'red',textAlign:'center',margin:'20px 0'}}>{sheetError}</div>}
      {!loading && !sheetError && filtered.length === 0 && (
        <div style={{textAlign:'center',margin:'40px 0',fontSize:20,color:'#888'}}>No results match your search or filter.</div>
      )}

      {!isSignedIn && gapiLoaded && (
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <button onClick={handleSignIn} style={{ ...btnStyle("#1976d2"), fontSize: 18, padding: "10px 24px" }}>Sign in with Google</button>
        </div>
      )}
      {gapiError && (
        <div style={{ color: "red", textAlign: "center", margin: "10px 0", fontWeight: "bold" }}>{gapiError}</div>
      )}
      {isSignedIn && googleUser && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <span>Welcome, {googleUser.getBasicProfile().getEmail()}</span>
          <button onClick={handleSignOut} style={{ ...btnStyle("#757575"), marginLeft: 12 }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

MaintenanceEditor.propTypes = {};

// زر البحث في سطر منفصل ومنسق
function FilterButtons({ filterMode, setFilterMode, accidentCount, invygoCount, notReadyCount, duplicatesCount, delayedCount, modifiedData, search, setSearch, allRowsCount, totalLossCount }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <select
          aria-label="Filter selector"
          value={filterMode}
          onChange={e => setFilterMode(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 12,
            border: "2px solid #7c4dff",
            fontSize: 16,
            minWidth: 180,
            fontWeight: "bold",
            color: "#6a1b9a",
            background: "#fffde7",
            boxShadow: "0 2px 8px #e1bee7"
          }}
        >
          <option value="all">🔄 Show All ({allRowsCount})</option>
          <option value="accident">🚗 Car Accident ({accidentCount})</option>
          <option value="invygo">📦 Invygo Cars ({invygoCount})</option>
          <option value="notready">❌ Not Ready ({notReadyCount})</option>
          <option value="duplicates">🛑 Duplicates ({duplicatesCount})</option>
          <option value="delayed">⏱ Show Delayed ({delayedCount})</option>
          <option value="totalloss">💥 Total Loss ({totalLossCount})</option>
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <input
          aria-label="Search"
          type="text"
          placeholder="🔍 Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: 12,
            minWidth: 260,
            borderRadius: 16,
            border: "2px solid #7c4dff",
            fontSize: 17,
            boxShadow: "0 2px 8px #e1bee7",
            outline: "none",
            textAlign: "center",
            background: "#fafafa",
            transition: "border 0.2s, box-shadow 0.2s"
          }}
        />
      </div>
    </div>
  );
}
FilterButtons.propTypes = {
  filterMode: PropTypes.string.isRequired,
  setFilterMode: PropTypes.func.isRequired,
  accidentCount: PropTypes.number.isRequired,
  invygoCount: PropTypes.number.isRequired,
  notReadyCount: PropTypes.number.isRequired,
  duplicatesCount: PropTypes.number.isRequired,
  delayedCount: PropTypes.number.isRequired,
  modifiedData: PropTypes.array.isRequired,
  search: PropTypes.string.isRequired,
  setSearch: PropTypes.func.isRequired,
  allRowsCount: PropTypes.number.isRequired,
  totalLossCount: PropTypes.number.isRequired
};

// زر التصدير اسمه Export فقط
function ExportButtons({ exportToExcel }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 10 }}>
      <button aria-label="Export all" onClick={exportToExcel} style={btnStyle("#388e3c")}>📤 Export</button>
    </div>
  );
}
ExportButtons.propTypes = {
  exportToExcel: PropTypes.func.isRequired
};

// جدول HTML عادي مع فلترة بالبحث فقط
function MaintenanceTable({ filtered, getDisplayRows, invygoPlates, duplicatePlates, duplicateRows, getNote }) {
  // دالة ترجمة اسم العمود للرأس
  function getHeaderLabel(col) {
    if (col === "Index") return "#";
    if (col === "Days Delayed") return "D.Delay";
    return col;
  }
  // دالة إرجاع style خاص لعمود Damage Details
  function getCellStyle(col, value) {
    if (col === "Damage Details") {
      return {
        border: '1px solid #7c4dff',
        padding: '6px 3px',
        fontSize: 13,
        textAlign: 'center',
        maxWidth: 320,
        minWidth: 120,
        whiteSpace: 'nowrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        background: undefined,
        cursor: value && value.length > 30 ? 'pointer' : undefined
      };
    }
    if (col === "Notes") {
      return {
        border: '1px solid #7c4dff',
        padding: '6px 3px',
        fontSize: 13,
        textAlign: 'center',
        maxWidth: 90,
        minWidth: 60,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        background: undefined
      };
    }
    return {
      border: '1px solid #7c4dff',
      padding: '6px 3px',
      fontSize: 13,
      textAlign: 'center',
      maxWidth: 120,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      background: undefined
    };
  }

  // تجهيز البيانات والأعمدة
  const tableRows = getDisplayRows(filtered).map((row, i) => ({ ...row, Notes: getNote(row, i) }));
  const allKeys = Array.from(
    new Set(
      tableRows.flatMap(row => Object.keys(row))
    )
  );
  // ترتيب الأعمدة حسب طلب المستخدم
  const preferredOrder = [
    "Index", // #
    "Vehicle",
    "model",
    "Damage Details",
    "Date OUT",
    "Date IN",
    "Status",
    "Days Delayed",
    "Notes"
  ];
  // فقط الأعمدة الموجودة فعليًا في البيانات
  const columns = [
    ...preferredOrder.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !preferredOrder.includes(k))
  ];

  // دالة تحديد كلاس الصف حسب حالته
  function getRowClass(row) {
    const plate = normalizePlate(row["Vehicle"]);
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
    const dateIn = dateInKey && row[dateInKey]?.trim();
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const isInvygo = invygoPlates.includes(plate);
    const isAccident = damageText?.includes("accident") && !dateIn;
    const isReady = Boolean(dateIn);
    if (row["Days Delayed"]) return 'row-delayed';
    if (plate && duplicatePlates[plate]) return 'row-duplicate';
    if (isInvygo && isReady) return 'row-invygo-ready';
    if (isInvygo && !isReady) return 'row-invygo-notready';
    if (!isInvygo && isReady) return 'row-ready';
    if (isAccident) return 'row-accident';
    if (!isInvygo && !isReady) return 'row-notready';
    return '';
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600, fontFamily: 'Segoe UI', background: '#fff' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col} style={{
                background: '#ffd600',
                color: '#6a1b9a',
                fontWeight: 900,
                fontSize: 14,
                border: '1px solid #7c4dff',
                padding: '8px 4px',
                textAlign: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 2
              }}>{getHeaderLabel(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, i) => (
            <tr key={i} className={getRowClass(row)}>
              {columns.map(col => (
                <td key={col} style={getCellStyle(col, row[col])} title={col === 'Damage Details' && row[col] ? row[col] : undefined}>
                  {row[col] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
MaintenanceTable.propTypes = {
  filtered: PropTypes.array.isRequired,
  getDisplayRows: PropTypes.func.isRequired,
  invygoPlates: PropTypes.array.isRequired,
  duplicatePlates: PropTypes.object.isRequired,
  duplicateRows: PropTypes.object.isRequired,
  getNote: PropTypes.func.isRequired,
};

