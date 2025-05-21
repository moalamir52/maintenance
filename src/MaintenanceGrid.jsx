import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

export default function MaintenanceEditor() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [modifiedData, setModifiedData] = useState([]);
  const [editCell, setEditCell] = useState(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [carDatabase, setCarDatabase] = useState([]);
  const [duplicatePlates, setDuplicatePlates] = useState({});
  const tableRef = useRef(null);

  useEffect(() => {
    const fetchMaintenanceSheet = async () => {
      try {
        const response = await fetch(
          "https://docs.google.com/spreadsheets/d/1v4rQWn6dYPVQPd-PkhvrDNgKVnexilrR2XIUVa5RKEM/export?format=csv&gid=0"
        );
        const text = await response.text();
        const rows = text.split("\n").map((r) => r.split(","));
        const headers = rows[0];
        const values = rows.slice(1);
        const parsed = values.map((row) =>
          Object.fromEntries(row.map((cell, i) => [headers[i], cell]))
        );
        setData(parsed);
        setModifiedData(parsed);
      } catch (err) {
        console.error("Error loading sheet:", err);
      }
    };
    fetchMaintenanceSheet();
  }, []);

  useEffect(() => {
    const counts = {};
    modifiedData.forEach((row) => {
      const plate = row["Vehicle"]?.trim().toLowerCase();
      if (plate) counts[plate] = (counts[plate] || 0) + 1;
    });
    const duplicates = Object.fromEntries(
      Object.entries(counts).filter(([_, count]) => count > 1)
    );
    setDuplicatePlates(duplicates);
  }, [modifiedData]);

  const handleCarListUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: "binary" });
      const sheet = workbook.Sheets["Fleet DXB"];
      const json = XLSX.utils.sheet_to_json(sheet);
      setCarDatabase(json);
    };
    reader.readAsBinaryString(file);
  };

  const handleEdit = (rowIndex, key, value) => {
    setModifiedData((prev) => {
      const updated = [...prev];

      if (
        (key.toLowerCase().includes("date") ||
          key.toLowerCase().includes("in") ||
          key.toLowerCase().includes("out")) &&
        /^\d{8}$/.test(value) &&
        !value.includes("/")
      ) {
        value = value.replace(/(\d{2})(\d{2})(\d{4})/, "$1/$2/$3");
      }

      updated[rowIndex] = { ...updated[rowIndex], [key]: value };

      if (key === "Vehicle" && value) {
        const found = carDatabase.find(
          (c) =>
            c["Plate No"]?.toString().trim().toLowerCase() ===
            value.toString().trim().toLowerCase()
        );
        if (found) {
          updated[rowIndex]["model"] = found["Model"];
          updated[rowIndex]["Color"] = found["Color"];
        }
      }

      return updated;
    });
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(modifiedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Maintenance");
    XLSX.writeFile(wb, `Maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filtered = modifiedData.filter((row) => {
    const matchesSearch = Object.values(row).some((v) =>
      v.toLowerCase().includes(search.toLowerCase())
    );
    const dateInKey = Object.keys(row).find((k) => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find((k) => k.toLowerCase().includes("damag"));
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const hasDate = dateInKey && row[dateInKey]?.trim() !== "";

    const invygoWords = ["invygo", "invigo", "envygo", "invgoy"];
    const isInvygo = invygoWords.some((word) => damageText?.includes(word));

    if (filterMode === "accident") return matchesSearch && damageText?.includes("accident") && !hasDate;
    if (filterMode === "invygo") return matchesSearch && isInvygo && !hasDate;
    if (filterMode === "ready") return matchesSearch && hasDate;
    if (filterMode === "notready") return matchesSearch && !hasDate;
    if (filterMode === "duplicates") {
      const plate = row["Vehicle"]?.trim().toLowerCase();
      return plate && duplicatePlates[plate];
    }
    return matchesSearch;
  });

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
    if (e.key === "Enter") {
      e.target.blur();
    }
  };

  const getRowStyle = (row) => {
    const dateInKey = Object.keys(row).find((k) => k.toLowerCase().includes("date in"));
    const damageKey = Object.keys(row).find((k) => k.toLowerCase().includes("damag"));
    const dateInValue = dateInKey && row[dateInKey]?.trim();
    const damageText = damageKey && row[damageKey]?.toLowerCase();
    const plate = row["Vehicle"]?.trim().toLowerCase();

    if (plate && duplicatePlates[plate]) return { backgroundColor: "#e53935", color: "#fff" };

    const hasInvygo = damageText && ["invygo", "invigo", "envygo", "invgoy"].some((word) => damageText.includes(word));
    const hasAccident = damageText?.includes("accident");
    const hasDateIn = dateInValue && dateInValue !== "";

    if (hasInvygo && hasAccident && !hasDateIn) return { backgroundColor: "#ffe0b2" };
    if (hasInvygo && !hasDateIn) return { backgroundColor: "#fff3cd" };
    if (hasInvygo && hasDateIn) return { backgroundColor: "#e0f7e9" };
    if (hasAccident && !hasDateIn) return { backgroundColor: "#ffdddd" };
    if (hasDateIn) return { backgroundColor: "#d0f5d0" };

    return {};
  };

  function btnStyle(color) {
    return {
      background: color,
      color: "white",
      padding: "6px 10px",
      fontSize: "13px",
      borderRadius: 8,
      border: "none",
      fontWeight: "bold",
    };
  }

  return (
    <div style={{ padding: 20, fontFamily: "Segoe UI" }}>
      <h2 style={{ textAlign: "center", color: "#6a1b9a" }}>🛠 Maintenance Sheet Editor</h2>

      <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setFilterMode("accident")} style={btnStyle("#ff9800")}>🚗 Car Accident</button>
        <button onClick={() => setFilterMode("invygo")} style={btnStyle("#4caf50")}>📦 Invygo Cars</button>
        <button onClick={() => setFilterMode("notready")} style={btnStyle("#f44336")}>❌ Not Ready</button>
        <button onClick={() => setFilterMode("duplicates")} style={btnStyle("#9c27b0")}>🛑 Duplicates</button>
        <button onClick={() => setFilterMode("all")} style={btnStyle("#1976d2")}>🔄 Show All</button>
        <input type="text" placeholder="🔍 Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: 8, minWidth: 300, borderRadius: 6, border: "1px solid #ccc" }} />
        <button onClick={exportToExcel} style={btnStyle("#388e3c")}>📤 Export</button>
        <input type="file" accept=".xlsx, .xls" onChange={handleCarListUpload} style={{ fontSize: "13px" }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 10, color: "#555" }}>
        ✅ Showing {filtered.length} result(s)
      </div>

      <div style={{ overflowX: "auto", maxHeight: "70vh" }} ref={tableRef}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#ffd600", color: "#6a1b9a" }}>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>#</th>
              {Object.keys(modifiedData[0] || {}).map((key) => (
                <th key={key} style={{ border: "1px solid #ccc", padding: 8, textAlign: "center", fontWeight: "bold" }}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ ...getRowStyle(row), backgroundColor: selectedRowIndex === rowIndex ? "#c5cae9" : getRowStyle(row).backgroundColor }}>
                <td style={{ border: "1px solid #ddd", padding: 6, textAlign: "center", cursor: "pointer" }} onClick={() => setSelectedRowIndex(selectedRowIndex === rowIndex ? null : rowIndex)}>{rowIndex + 1}</td>
                {Object.entries(row).map(([key, value], colIndex) => (
                  <td key={colIndex} style={{ border: "1px solid #ddd", padding: 6, textAlign: "center", fontWeight: "bold" }}>
                    <input
                      value={value}
                      data-cell
                      data-row={rowIndex}
                      data-col={colIndex}
                      onChange={(e) => handleEdit(rowIndex, key, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                      onDoubleClick={() => setEditCell(`${rowIndex}-${colIndex}`)}
                      onBlur={(e) => {
                        if (editCell !== `${rowIndex}-${colIndex}`) return;
                        handleEdit(rowIndex, key, e.target.value);
                        setEditCell(null);
                      }}
                      readOnly={editCell !== `${rowIndex}-${colIndex}`}
                      style={{
                        width: "100%",
                        border: "none",
                        background: editCell === `${rowIndex}-${colIndex}` ? "#fff" : "transparent"
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
