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
  const tableRef = useRef(null);

  // قائمة أرقام سيارات invygo كاملة
  const invygoList = [
    "f62443", "e62059", "e48708", "g16281", "f67224", "f60973", "y87421", "g20385", "f10750", "e59684",
    "t64026", "r69915", "t28875", "t88742", "r72392", "t61471", "t61074", "s32761", "s30916", "s34737", "s37248",
    "s32248", "s34138", "s33098", "s33573", "t63147", "s35076", "t93536", "t93285", "t82563", "t58645", "t61724",
    "t61377", "t61450", "t66489", "s37005", "s37285", "r85860", "r73445", "r76490", "r80128", "r80155", "r86003",
    "r75420", "r75429", "r84563", "r88409", "r76317", "r86080", "r85882", "r85160", "aa15916", "aa15002", "aa15920",
    "aa15021", "aa14992", "aa14995", "aa15006", "aa15007", "aa15923", "aa14997", "aa15009", "aa15003", "j66201",
    "aa15004", "aa15008", "r37029", "r36675", "q96589", "r53826", "r51619", "aa15918", "r52488", "r17061", "s72129",
    "r44830", "r22603", "r28968", "j68247", "j94519", "j81598", "j96121", "r36929", "j42625", "r13492", "r36174",
    "s71922", "s75328", "r22937", "s64835", "s64833", "j60185", "j79165", "s61759", "s74924", "s74354", "s70425",
    "s62860", "s70848", "j58197", "j76574", "z48928", "z47957", "aa30014", "z50329", "z49625", "z50325", "z49507",
    "r34461", "t55210", "r17048", "r16713", "t58751", "t56712", "t53810", "r15013", "z48285", "r18683", "z48102",
    "r26125", "t70588", "z47981", "r20497", "r35976", "r36097", "r29460", "r20253", "r35345", "t58875", "r30376",
    "z49428", "r29024", "aa80047", "t54238", "aa80031", "aa29985", "aa80056", "aa80049", "aa29987", "aa80057",
    "aa29982", "aa80051", "aa29983", "aa80052", "aa29984", "aa80053", "aa29986", "aa80054", "aa29980", "cc12935",
    "cc12238", "cc12936", "cc12934", "cc12231", "cc12939", "cc12237", "cc12236", "cc12235", "cc12209", "cc12937",
    "cc12207", "cc12206", "cc12942", "cc12205", "cc12204", "cc12938", "cc12203", "cc12940", "cc12208", "f18326",
    "f18323", "f17754", "f17732", "f17975", "bb43302", "f18583", "bb43307", "f18210", "bb43306", "bb43305",
    "bb43304", "cc13053", "cc10450", "cc10449", "f19054", "f18626", "f19131", "b18431", "f19176", "f17724",
    "f18257", "f18136", "f17514", "f18086", "f18433", "f18320", "cc13071", "f17315", "cc32520", "cc32492",
    "cc32526", "cc31030", "cc32547", "cc32511", "cc32524", "cc31043", "cc32540", "cc32491", "cc31042", "cc31046",
    "cc32558", "cc32554", "cc32501", "cc32553", "cc31041", "cc32538", "cc31038", "cc32493", "cc32510", "cc32557",
    "cc32563", "cc31040", "cc32499", "cc32507", "cc31044", "cc32537", "cc32494", "cc32488", "cc32550", "cc31047",
    "cc32514", "cc32515", "cc32546", "cc32562", "cc32495", "cc32509", "cc32556", "cc32517", "cc32504", "cc32521",
    "cc32549", "cc32496", "cc32560", "cc32561", "cc32527", "cc31036", "cc32535", "cc32544", "q91064", "r34842",
    "r38697", "r36953", "r56260", "r63441", "r54090", "r25270", "r67604", "q96758", "r68227", "r56625",
    "r72343", "q90946", "r70974", "q91745", "r63418", "r35417", "r58495", "r67572", "r67740", "r56549",
    "r63684", "r67519", "r67408", "r43921", "q95245", "r34781", "r71806", "r69331", "r68107", "r65528",
    "r67795", "q96673", "r68609", "r72030", "r69558", "r43518", "r68239", "q93985", "r42977", "r69392",
    "q96453", "r70466", "r68219", "r67749", "q95389", "r72154", "r56530", "r41033"
  ];

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

  // عدادات الفلاتر
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
  // أضف عمود Days Delayed لكل صف
  const exportRows = delayedCars.map(row => {
    const damageKey = Object.keys(row).find(k => k.toLowerCase().includes("damag"));
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
          🚨 يوجد {delayedCars.length} سيارة متأخرة عن المدة المسموحة في الورشة!
        </div>
      )}

      <div ref={tableRef} style={{ overflowX: "auto", maxHeight: "70vh" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#ffd600", color: "#6a1b9a" }}>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>#</th>
              {Object.keys(modifiedData[0] || {}).map((key) => (
                <th key={key} style={{ border: "1px solid #ccc", padding: 8 }}>{key}</th>
              ))}
              <th style={{ border: "1px solid #ccc", padding: 8 }}>Notes</th>
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
                  note = `مكرر مع الصفوف: ${others.join(", ")}`;
                }
              }
              return (
                <tr key={rowIndex} style={{ ...getRowStyle(row), backgroundColor: selectedRowIndex === rowIndex ? "#c5cae9" : getRowStyle(row).backgroundColor }}>
                  <td style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }} onClick={() => setSelectedRowIndex(rowIndex)}>{rowIndex + 1}</td>
                  {Object.entries(row).map(([key, value], colIndex) => (
                    <td key={colIndex} style={{ border: "1px solid #ddd", padding: 6 }}>
                      <input
                        value={value}
                        data-row={rowIndex}
                        data-col={colIndex}
                        onChange={(e) => handleEdit(rowIndex, key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                        style={{ width: "100%", border: "none", background: "transparent" }}
                      />
                    </td>
                  ))}
                  <td style={{ border: "1px solid #ccc", padding: 6, color: "#fff", fontWeight: "bold", fontSize: 13 }}>{note}</td>
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