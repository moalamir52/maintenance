import React, { useState, useEffect } from "react";
import DataGrid from "react-data-grid";
import * as XLSX from "xlsx";
import "react-data-grid/lib/styles.css";

export default function MaintenanceGrid() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedColor, setSelectedColor] = useState("#ffffff");

  useEffect(() => {
    const fetchSheet = async () => {
      const fallbackCSV = `Date IN,Vehicle,Status\n01052024,Car A,Ready\n02052024,Car B,In Maintenance`;
      let text = fallbackCSV;
      try {
        const res = await fetch("https://docs.google.com/spreadsheets/d/1v4rQWn6dYPVQPd-PkhvrDNgKVnexilrR2XIUVa5RKEM/export?format=csv&gid=0");
        if (res.ok) {
          text = await res.text();
        } else {
          console.warn("Using fallback data due to fetch error");
        }
      } catch (e) {
        console.warn("Fetch failed, using fallback data.", e);
      }

      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && line.includes(","));

      const rowsData = lines.map((r) => r.split(","));
      const headers = rowsData[0];
      const values = rowsData.slice(1).filter((r) => r.length === headers.length);

      setColumns(
        headers.map((header) => ({
          key: header,
          name: header,
          editable: true,
          resizable: true,
          cellClass: () => "editable-cell"
        }))
      );

      setRows(
        values.map((r) =>
          Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
        )
      );
    };
    fetchSheet();
  }, []);

  const onRowsChange = (updatedRows) => {
    setRows(updatedRows);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Maintenance");
    XLSX.writeFile(wb, `Maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const applyColor = () => {
    document.querySelectorAll(".editable-cell input").forEach((cell) => {
      cell.style.backgroundColor = selectedColor;
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: "Segoe UI" }}>
      <h2 style={{ textAlign: "center", color: "#6a1b9a" }}>📋 Maintenance Grid (Excel-style)</h2>

      <div style={{ marginBottom: 15, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={exportToExcel}
          style={{
            backgroundColor: "#388e3c",
            color: "white",
            padding: "10px 16px",
            fontWeight: "bold",
            borderRadius: 8,
            border: "none"
          }}
        >
          📤 Export to Excel
        </button>
        <label style={{ fontWeight: "bold", alignSelf: "center" }}>Highlight Color:</label>
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => setSelectedColor(e.target.value)}
          style={{ width: 40, height: 40, border: "none" }}
        />
        <button
          onClick={applyColor}
          style={{
            backgroundColor: selectedColor,
            color: "#000",
            padding: "10px 16px",
            fontWeight: "bold",
            borderRadius: 8,
            border: "1px solid #666"
          }}
        >
          🎨 Apply Color
        </button>
        <a
          href="https://moalamir52.github.io/Yelo/#dashboard"
          style={{
            backgroundColor: "#ffd600",
            color: "#6a1b9a",
            padding: "10px 16px",
            borderRadius: 8,
            border: "2px solid #6a1b9a",
            textDecoration: "none",
            fontWeight: "bold"
          }}
        >
          ← Back to Dashboard
        </a>
      </div>

      <div style={{ height: "70vh" }}>
        <DataGrid columns={columns} rows={rows} onRowsChange={onRowsChange} className="editable-cell" />
      </div>
    </div>
  );
}