// MaintenanceEditor with robust date parsing

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { differenceInDays, parse } from "date-fns";
import PropTypes from "prop-types";

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

  const getDelayedCars = (rows) => {
    return rows.filter(row => {
      const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
      const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));

      const damage = damageKey && row[damageKey]?.toLowerCase();
      const dateOutStr = dateOutKey && row[dateOutKey]?.trim();
      const dateIn = dateInKey && row[dateInKey]?.trim();

      if (!dateOutStr || dateIn) return false;

      const dateOut = parseDate(dateOutStr);
      if (isNaN(dateOut)) return false;

      const daysPassed = differenceInDays(today, dateOut);

      if (damage?.includes("oil") && daysPassed > 3) return true;
      if (damage?.includes("accident") && daysPassed > 30) return true;
      if (!damage?.includes("oil") && !damage?.includes("accident") && daysPassed > 3) return true;

      return false;
    });
  };

  let filtered = [];
  if (filterMode === "delayed") {
    const delayedRows = getDisplayRows(modifiedData).filter(row => row["Days Delayed"] !== "");
    filtered = delayedRows.map((row, i) => ({ ...row, Index: i + 1 }));
  } else {
    // فلترة حسب الفلتر المختار
    const baseRows = modifiedData.filter(row => {
      const vehicle = row["Vehicle"]?.trim();
      if (!vehicle || vehicle === "#N/A" || vehicle === "") return false;
      const matchesSearch = Object.values(row).some(v => v.toLowerCase().includes(search.toLowerCase()));
      const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
      const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
      const damageText = damageKey && row[damageKey]?.toLowerCase();
      const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
      const plate = normalizePlate(row["Vehicle"]);
      if (filterMode === "accident") return matchesSearch && damageText?.includes("accident") && !hasDate;
      if (filterMode === "invygo") return matchesSearch && plate && invygoPlates.includes(plate) && !hasDate;
      if (filterMode === "ready") return matchesSearch && hasDate;
      if (filterMode === "notready") return matchesSearch && !hasDate;
      if (filterMode === "duplicates") {
        if (!plate || !duplicatePlates[plate]) return false;
        const dateIn = dateInKey && row[dateInKey]?.trim();
        return !dateIn;
      }
      return matchesSearch;
    });
    // أعد الترقيم بعد الفلترة
    filtered = getDisplayRows(baseRows).map((row, i) => ({ ...row, Index: i + 1 }));
  }

  // دالة توليد الملاحظة لكل صف
  function getNote(row, rowIndex = 0) {
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
    return dateInKey && row[dateInKey]?.trim() === "";
  }).length;

  const duplicatesCount = Object.values(duplicatePlates).reduce((a, b) => a + b, 0);
  const delayedCount = getDisplayRows(modifiedData).filter(row => row["Days Delayed"] !== "").length;

  const resetData = () => {
    if (window.confirm("Are you sure you want to reset all changes?")) {
      setModifiedData(data);
      setSearch("");
      setFilterMode("all");
      setSelectedRowIndex(null);
    }
  };

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

  return (
    <div style={{ padding: 10, fontFamily: "Segoe UI", maxWidth: 1200, margin: "auto" }}>
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

        <FilterButtons filterMode={filterMode} setFilterMode={setFilterMode} accidentCount={accidentCount} invygoCount={invygoCount} notReadyCount={notReadyCount} duplicatesCount={duplicatesCount} delayedCount={delayedCount} modifiedData={modifiedData} search={search} setSearch={setSearch} />
        <ExportButtons exportToExcel={exportToExcel} resetData={resetData} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 10, color: "#555" }}>✅ Showing {filtered.length} result(s)</div>

      {filtered.length > 0 && (
        <div style={{ textAlign: "center", marginBottom: 10, color: "red", fontWeight: "bold" }}>
          🚨 There are {filtered.length} delayed cars in the Showroom!
        </div>
      )}

      <MaintenanceTable filtered={filtered} getRowStyle={getRowStyle} selectedRowIndex={selectedRowIndex} setSelectedRowIndex={setSelectedRowIndex} handleEdit={handleEdit} handleKeyDown={handleKeyDown} duplicatePlates={duplicatePlates} duplicateRows={duplicateRows} getDisplayRows={getDisplayRows} invygoPlates={invygoPlates} search={search} />
      <style>{`
        :root {
          --main-purple: #6a1b9a;
          --main-yellow: #ffd600;
          --main-green: #4caf50;
          --main-orange: #ff9800;
          --main-red: #f44336;
          --main-blue: #1976d2;
          --main-pink: #9c27b0;
        }
        tr:hover {
          background: #f3e5f5 !important;
          color: #222 !important;
        }
        @media (max-width: 900px) {
          table { min-width: 600px !important; }
          input { font-size: 12px; }
          .main-title-box h2 { font-size: 22px !important; }
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
        }
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
function FilterButtons({ filterMode, setFilterMode, accidentCount, invygoCount, notReadyCount, duplicatesCount, delayedCount, modifiedData, search, setSearch }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="filter-btns-row" style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button aria-label="Accident filter" onClick={() => setFilterMode("accident")} style={btnStyle("#ff9800")}>🚗 Car Accident ({accidentCount})</button>
        <button aria-label="Invygo filter" onClick={() => setFilterMode("invygo")} style={btnStyle("#4caf50")}>📦 Invygo Cars ({invygoCount})</button>
        <button aria-label="Not Ready filter" onClick={() => setFilterMode("notready")} style={btnStyle("#f44336")}>❌ Not Ready ({notReadyCount})</button>
        <button aria-label="Duplicates filter" onClick={() => setFilterMode("duplicates")} style={btnStyle("#9c27b0")}>🛑 Duplicates ({duplicatesCount})</button>
        <button aria-label="Delayed filter" onClick={() => setFilterMode("delayed")} style={btnStyle("#ff7043")}>⏱ Show Delayed ({delayedCount})</button>
        <button aria-label="Show all" onClick={() => setFilterMode("all")} style={btnStyle("#1976d2")}>🔄 Show All ({modifiedData.length})</button>
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
  setSearch: PropTypes.func.isRequired
};

// زر التصدير اسمه Export فقط
function ExportButtons({ exportToExcel, resetData }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 10 }}>
      <button aria-label="Export all" onClick={exportToExcel} style={btnStyle("#388e3c")}>📤 Export</button>
      <button aria-label="Reset" onClick={resetData} style={btnStyle("#757575")}>↩️ Reset</button>
    </div>
  );
}
ExportButtons.propTypes = {
  exportToExcel: PropTypes.func.isRequired,
  resetData: PropTypes.func.isRequired
};

// جدول العرض
function MaintenanceTable({ filtered, getRowStyle, selectedRowIndex, setSelectedRowIndex, handleEdit, handleKeyDown, duplicatePlates, duplicateRows, getDisplayRows, invygoPlates, search }) {
  const tableRows = filterColumnsWithData(getDisplayRows(filtered));
  const columns = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];
  const tableDivStyle = search && search.trim() !== ""
    ? { overflowX: "auto", maxHeight: "70vh", minHeight: "120px" }
    : { overflowX: "auto", height: "100vh", minHeight: "100vh" };
  return (
    <div style={tableDivStyle}>
      <table aria-label="جدول الصيانة" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead style={{ position: "sticky", top: 0, background: "#ffd600", color: "#6a1b9a" }}>
          <tr>
            {columns.map((key) => (
              <th key={key} style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{key}</th>
            ))}
            <th style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, rowIndex) => {
            const plate = normalizePlate(row["Vehicle"]);
            let note = "";
            let carType = invygoPlates.includes(normalizePlate(row["Vehicle"])) ? "Invygo" : "Yelo";
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
            note = `${carType} ${status}`;
            return (
              <tr key={rowIndex} style={{ ...getRowStyle(row), backgroundColor: selectedRowIndex === rowIndex ? "#c5cae9" : getRowStyle(row).backgroundColor }}>
                {columns.map((key, colIndex) => (
                  <td key={colIndex} style={{ border: "1px solid #ddd", padding: 6, textAlign: "center" }}>
                    {row[key]}
                  </td>
                ))}
                <td style={{ border: "1px solid #ccc", padding: 6, color: "#6a1b9a", fontWeight: "bold", fontSize: 13, textAlign: "center", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
MaintenanceTable.propTypes = {
  filtered: PropTypes.array.isRequired,
  getRowStyle: PropTypes.func.isRequired,
  selectedRowIndex: PropTypes.number,
  setSelectedRowIndex: PropTypes.func.isRequired,
  handleEdit: PropTypes.func.isRequired,
  handleKeyDown: PropTypes.func.isRequired,
  duplicatePlates: PropTypes.object.isRequired,
  duplicateRows: PropTypes.object.isRequired,
  getDisplayRows: PropTypes.func.isRequired,
  invygoPlates: PropTypes.array.isRequired,
  search: PropTypes.string.isRequired
};

