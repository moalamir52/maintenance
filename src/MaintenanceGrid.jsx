import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { differenceInDays, parse } from "date-fns";

export default function MaintenanceEditor() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [modifiedData, setModifiedData] = useState([]);
  const [editCell, setEditCell] = useState(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [duplicatePlates, setDuplicatePlates] = useState({});
  const [duplicateRows, setDuplicateRows] = useState({});
  const [invygoList, setInvygoList] = useState([]);
  const tableRef = useRef(null);

  // Fetch Invygo list from Google Sheet
  useEffect(() => {
    const fetchInvygoList = async () => {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1sHvEQMtt3suuxuMA0zhcXk5TYGqZzit0JvGLk1CQ0LI/export?format=csv&gid=1812913588");
      const text = await response.text();
      const rows = text.split("\n").map(r => r.trim()).filter(Boolean);
      const plates = rows.slice(1).map(r => r.replace(/\s+/g, "").toLowerCase());
      setInvygoList(plates);
    };
    fetchInvygoList();
  }, []);

  function normalizePlate(plate) {
    return plate?.trim().toLowerCase().replace(/\s+/g, "") || "";
  }

  useEffect(() => {
    const fetchSheet = async () => {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1v4rQWn6dYPVQPd-PkhvrDNgKVnexilrR2XIUVa5RKEM/export?format=csv&gid=0");
      const text = await response.text();
      const rows = text.split("\n").map(r => r.split(","));
      const headers = rows[0];
      const parsed = rows.slice(1).map(r => Object.fromEntries(r.map((v, i) => [headers[i], v])));
      setData(parsed);
      setModifiedData(parsed);
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

      if (damage?.includes("accident") && damage?.includes("oil") && daysPassed > 37) return true;
      if (damage?.includes("oil") && !damage?.includes("accident") && daysPassed > 3) return true;
      if (damage?.includes("accident") && !damage?.includes("oil") && daysPassed > 30) return true;
      if (!damage?.includes("oil") && !damage?.includes("accident") && daysPassed > 7) return true;

      return false;
    });
  };

  const delayedCars = getDelayedCars(modifiedData);

  // Filter counts
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
    return plate && invygoList.includes(plate) && !hasDate;
  }).length;
  const notReadyCount = modifiedData.filter(row => {
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    return dateInKey && row[dateInKey]?.trim() === "";
  }).length;
  const duplicatesCount = Object.values(duplicatePlates).reduce((a, b) => a + b, 0);
  const delayedCount = delayedCars.length;

  const filtered = modifiedData.filter(row => {
    const matchesSearch = Object.values(row).some(v => v.toLowerCase().includes(search.toLowerCase()));
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const hasDate = dateInKey && row[dateInKey]?.trim() !== "";
    const plate = normalizePlate(row["Vehicle"]);

    if (filterMode === "accident") return matchesSearch && damageText?.includes("accident") && !hasDate;
    if (filterMode === "invygo") return matchesSearch && plate && invygoList.includes(plate) && !hasDate;
    if (filterMode === "ready") return matchesSearch && hasDate;
    if (filterMode === "notready") return matchesSearch && !hasDate;
    if (filterMode === "duplicates") return plate && duplicatePlates[plate];
    if (filterMode === "delayed") return delayedCars.includes(row);
    return matchesSearch;
  });

  const getRowStyle = (row) => {
    const dateInKey = Object.keys(row).find(k => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
    const dateIn = dateInKey && row[dateInKey]?.trim();
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const plate = normalizePlate(row["Vehicle"]);

    const isInvygo = invygoList.includes(plate);
    const isAccident = damageText?.includes("accident") && !dateIn;
    const isReady = Boolean(dateIn);

    if (plate && duplicatePlates[plate]) return { backgroundColor: "#e53935", color: "#fff" };
    if (delayedCars.includes(row)) return { backgroundColor: "#ff7043", color: "#fff" };
    if (isInvygo && isReady) return { backgroundColor: "#bbdefb" };
    if (isInvygo && !isReady) return { backgroundColor: "#fff9c4" };
    if (!isInvygo && isReady) return { backgroundColor: "#c8e6c9" };
    if (isAccident) return { backgroundColor: "#ffcdd2" };
    return {};
  };

  const handleEdit = (rowIndex, key, value) => {
    setModifiedData((prev) => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      return updated;
    });
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

  const resetData = () => {
    setModifiedData(data);
    setSearch("");
    setFilterMode("all");
    setSelectedRowIndex(null);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(modifiedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Maintenance");
    XLSX.writeFile(wb, `Maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportDelayed = () => {
    // Add Days Delayed column
    const exportRows = delayedCars.map(row => {
      const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
      const dateOutStr = dateOutKey && row[dateOutKey];
      const dateOut = parseDate(dateOutStr);
      const daysPassed = differenceInDays(today, dateOut);
      return {
        ...row,
        "Days Delayed": daysPassed
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Delayed");
    XLSX.writeFile(wb, `Delayed_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportDuplicates = () => {
    const plates = Object.keys(duplicatePlates);
    const rows = modifiedData.filter(row => plates.includes(normalizePlate(row["Vehicle"])));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duplicates");
    XLSX.writeFile(wb, `Duplicates_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  function btnStyle(color) {
    return { background: color, color: "white", padding: "6px 10px", fontSize: "13px", borderRadius: 8, border: "none", fontWeight: "bold" };
  }

  return (
    <div style={{ padding: 10, fontFamily: "Segoe UI", maxWidth: 1200, margin: "auto" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ background: "#bbdefb", padding: "4px 8px", borderRadius: 6 }}>⬤ Invygo - Repaired</div>
        <div style={{ background: "#fff9c4", padding: "4px 8px", borderRadius: 6 }}>⬤ Invygo - Not Ready</div>
        <div style={{ background: "#c8e6c9", padding: "4px 8px", borderRadius: 6 }}>⬤ Other - Repaired</div>
        <div style={{ background: "#ffcdd2", padding: "4px 8px", borderRadius: 6 }}>⬤ Accident - Not Ready</div>
        <div style={{ background: "#ffffff", border: "1px solid #ccc", padding: "4px 8px", borderRadius: 6 }}>⬤ Other - Not Ready</div>
        <div style={{ background: "#ff7043", padding: "4px 8px", borderRadius: 6, color: "white" }}>⬤ ⏱ Delayed</div>
      </div>
<a
  href="https://moalamir52.github.io/Yelo/#dashboard"
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "#ffd600",
    color: "#6a1b9a",
    border: "3px solid #6a1b9a",
    borderRadius: 12,
    padding: "10px 28px",
    fontWeight: "bold",
    fontSize: 22,
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(106,27,154,0.08)",
    marginBottom: 24,
    marginTop: 8,
    transition: "box-shadow 0.2s"
  }}
>
  <span style={{ fontSize: 18, display: "flex", flexDirection: "column", alignItems: "center" }}>
    <span style={{ fontSize: 13, color: "#6a1b9a", fontWeight: "normal" }}>BACK</span>
    <span style={{ fontSize: 20 }}>←</span>
  </span>
  Back to YELO
</a>
      <h2 style={{ textAlign: "center", color: "#6a1b9a" }}>🛠 Maintenance Sheet Editor</h2>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => setFilterMode("accident")} style={btnStyle("#ff9800")}>🚗 Car Accident ({accidentCount})</button>
        <button onClick={() => setFilterMode("invygo")} style={btnStyle("#4caf50")}>📦 Invygo Cars ({invygoCount})</button>
        <button onClick={() => setFilterMode("notready")} style={btnStyle("#f44336")}>❌ Not Ready ({notReadyCount})</button>
        <button onClick={() => setFilterMode("duplicates")} style={btnStyle("#9c27b0")}>🛑 Duplicates ({duplicatesCount})</button>
        <button onClick={() => setFilterMode("delayed")} style={btnStyle("#ff7043")}>⏱ Show Delayed ({delayedCount})</button>
        <button onClick={() => setFilterMode("all")} style={btnStyle("#1976d2")}>🔄 Show All ({modifiedData.length})</button>
        <input type="text" placeholder="🔍 Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: 8, minWidth: 250, borderRadius: 6, border: "1px solid #ccc" }} />
        <button onClick={exportToExcel} style={btnStyle("#388e3c")}>📤 Export All</button>
        <button onClick={exportDelayed} style={btnStyle("#ff7043")}>📤 Export Delayed</button>
        <button onClick={exportDuplicates} style={btnStyle("#9c27b0")}>📤 Export Duplicates</button>
        <button onClick={resetData} style={btnStyle("#757575")}>↩️ Reset</button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 10, color: "#555" }}>✅ Showing {filtered.length} result(s)</div>

      {delayedCars.length > 0 && (
        <div style={{ textAlign: "center", marginBottom: 10, color: "red", fontWeight: "bold" }}>
          🚨 There are {delayedCars.length} delayed cars in the Showroom!
        </div>
      )}

      <div ref={tableRef} style={{ overflowX: "auto", maxHeight: "70vh" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#ffd600", color: "#6a1b9a" }}>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>#</th>
              {Object.keys(modifiedData[0] || {}).map((key) => (
                <th key={key} style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{key}</th>
              ))}
              <th style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rowIndex) => {
              const plate = normalizePlate(row["Vehicle"]);
              let note = "";
              if (plate && duplicatePlates[plate]) {
                const rows = duplicateRows[plate] || [];
                const others = rows.filter(n => n !== rowIndex + 1);
                if (others.length > 0) {
                  note = `Duplicate with rows: ${others.join(", ")}`;
                }
              }
              return (
                <tr key={rowIndex} style={{ ...getRowStyle(row), backgroundColor: selectedRowIndex === rowIndex ? "#c5cae9" : getRowStyle(row).backgroundColor }}>
                  <td style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }} onClick={() => setSelectedRowIndex(rowIndex)}>{rowIndex + 1}</td>
                  {Object.entries(row).map(([key, value], colIndex) => (
                    <td key={colIndex} style={{ border: "1px solid #ddd", padding: 6, textAlign: "center" }}>
                      <input
                        value={value}
                        data-row={rowIndex}
                        data-col={colIndex}
                        onChange={(e) => handleEdit(rowIndex, key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                        style={{ width: "100%", border: "none", background: "transparent", textAlign: "center" }}
                      />
                    </td>
                  ))}
                  <td style={{ border: "1px solid #ccc", padding: 6, color: "#fff", fontWeight: "bold", fontSize: 13, textAlign: "center" }}>{note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filterMode === "delayed" && delayedCars.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3 style={{ color: "#d84315", textAlign: "center", marginBottom: 16, letterSpacing: 1 }}>Delayed Cars Report</h3>
          <table style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            width: "100%",
            background: "#fff",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
          }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", fontWeight: "bold" }}>Car Plate</th>
                <th style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", fontWeight: "bold" }}>Damage Type</th>
                <th style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", fontWeight: "bold" }}>Date Out</th>
                <th style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", fontWeight: "bold" }}>Days Delayed</th>
              </tr>
            </thead>
            <tbody>
              {delayedCars.map((row, i) => {
                const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
                const dateOutKey = Object.keys(row).find(k => k.toLowerCase().includes("date out"));
                const damage = damageKey && row[damageKey];
                const dateOutStr = dateOutKey && row[dateOutKey];
                const dateOut = parseDate(dateOutStr);
                const daysPassed = differenceInDays(today, dateOut);
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fafafa" : "#f0f4c3" }}>
                    <td style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", fontWeight: "bold" }}>{row["Vehicle"]}</td>
                    <td style={{ border: "1px solid #ddd", padding: 10, textAlign: "center" }}>{damage}</td>
                    <td style={{ border: "1px solid #ddd", padding: 10, textAlign: "center" }}>{dateOutStr}</td>
                    <td style={{ border: "1px solid #ddd", padding: 10, textAlign: "center", color: "#d84315", fontWeight: "bold" }}>{daysPassed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        @media (max-width: 900px) {
          table { min-width: 600px !important; }
          input { font-size: 12px; }
        }
        @media (max-width: 600px) {
          table { min-width: 400px !important; }
          input { font-size: 11px; }
        }
      `}</style>
    </div>
  );
}