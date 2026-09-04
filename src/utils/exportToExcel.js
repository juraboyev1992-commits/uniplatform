import * as XLSX from 'xlsx';

// First shared export helper in the codebase — every other Excel export (CompetitionParticipantsTab.jsx
// and 5 other files) hand-rolls this same 3-call XLSX sequence independently. Extracted here specifically
// because this is the SECOND call site inside the competition module that needs it (Results Center);
// existing single-use call sites elsewhere are left exactly as they are, not migrated to this.
export const exportRowsToExcel = (rows, { sheetName = 'Sheet1', fileName, columnWidths } = {}) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    if (columnWidths) ws['!cols'] = columnWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
};
