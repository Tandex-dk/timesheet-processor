const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const REQUIRED_COLUMNS = [
  'First Name',
  'Last Name',
  'Date',
  'Worked Hours',
  'Break',
  'Absence',
  'Remarks',
  'Scheduled Shift',
];

const PUBLIC_HOLIDAY_REMARKS = new Set([
  'maundy thursday',
  'good friday',
  'easter monday',
]);

const VACATION_REMARKS = new Set([
  'vacation',
  'holiday',
  'ferie',
]);

const SICKNESS_REMARKS = new Set([
  'sick',
  'sickness',
  'sygdom',
  'illness',
]);

const FERIEFRIDAGE_REMARKS = new Set([
  'feriefridage',
  'feriefridag',
]);

const OUTPUT_COLUMNS = [
  'Fornavn',
  'Efternavn',
  'Arbejdstimer',
  'Pausejustering',
  'Sygetimer',
  'Ferietimer',
  'Feriefridagstimer',
  'Helligdagstimer',
  'Øvrige fraværstimer',
  'Justerede løntimer',
];

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets.Timesheet;

  if (!worksheet) {
    throw createValidationError(
      'missing_sheet',
      'Projektmappen skal indeholde et ark med navnet "Timesheet".'
    );
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  });

  if (!rows.length) {
    throw createValidationError(
      'empty_sheet',
      'Arket "Timesheet" indeholder ingen rækker.'
    );
  }

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !(column in rows[0]));
  if (missingColumns.length) {
    throw createValidationError(
      'missing_columns',
      `Projektmappen mangler obligatoriske kolonner: ${missingColumns.join(', ')}.`,
      { missingColumns }
    );
  }

  return normalizeRows(rows);
}

function normalizeRows(rows) {
  let currentFirstName = '';
  let currentLastName = '';

  return rows
    .map((row, index) => {
      const firstName = cleanText(row['First Name']) || currentFirstName;
      const lastName = cleanText(row['Last Name']) || currentLastName;

      if (firstName) currentFirstName = firstName;
      if (lastName) currentLastName = lastName;

      const date = cleanText(row['Date']);
      const workedHours = parseHourValue(row['Worked Hours']);
      const breakHours = parseHourValue(row['Break']);
      const absenceHours = parseHourValue(row['Absence']);
      const scheduledShiftHours = parseHourValue(row['Scheduled Shift']);
      const remark = cleanText(row['Remarks']);
      const absenceCategory = mapAbsenceCategory(remark, absenceHours);
      const shouldCountBreakAdjustment = workedHours > 0 && breakHours > 0;

      return {
        sourceRowNumber: index + 2,
        firstName,
        lastName,
        date,
        workedHours,
        breakHours,
        absenceHours,
        scheduledShiftHours,
        remark,
        absenceCategory,
        breakAdjustmentHours: shouldCountBreakAdjustment ? 0.25 : 0,
      };
    })
    .filter((row) => {
      if (!row.firstName || !row.lastName || !row.date) {
        return false;
      }

      return (
        row.workedHours > 0 ||
        row.breakHours > 0 ||
        row.absenceHours > 0 ||
        row.scheduledShiftHours > 0 ||
        row.remark
      );
    });
}

function mapAbsenceCategory(remark, absenceHours) {
  if (absenceHours <= 0) {
    return 'none';
  }

  const normalizedRemark = cleanText(remark).toLowerCase();

  if (FERIEFRIDAGE_REMARKS.has(normalizedRemark)) {
    return 'feriefridage';
  }

  if (PUBLIC_HOLIDAY_REMARKS.has(normalizedRemark)) {
    return 'publicHoliday';
  }

  if (VACATION_REMARKS.has(normalizedRemark)) {
    return 'vacation';
  }

  if (SICKNESS_REMARKS.has(normalizedRemark)) {
    return 'sickness';
  }

  return normalizedRemark ? 'otherAbsence' : 'otherAbsence';
}

function aggregateRows(rows) {
  const employees = new Map();

  for (const row of rows) {
    const key = `${row.firstName}::${row.lastName}`;
    if (!employees.has(key)) {
      employees.set(key, {
        firstName: row.firstName,
        lastName: row.lastName,
        workedHours: 0,
        breakAdjustmentHours: 0,
        sicknessHours: 0,
        vacationHours: 0,
        feriefridageHours: 0,
        publicHolidayHours: 0,
        otherAbsenceHours: 0,
        adjustedPayableHours: 0,
      });
    }

    const employee = employees.get(key);
    employee.workedHours += row.workedHours;
    employee.breakAdjustmentHours += row.breakAdjustmentHours;

    if (row.absenceCategory === 'sickness') {
      employee.sicknessHours += row.absenceHours;
    } else if (row.absenceCategory === 'vacation') {
      employee.vacationHours += row.absenceHours;
    } else if (row.absenceCategory === 'feriefridage') {
      employee.feriefridageHours += row.absenceHours;
    } else if (row.absenceCategory === 'publicHoliday') {
      employee.publicHolidayHours += row.absenceHours;
    } else if (row.absenceCategory === 'otherAbsence') {
      employee.otherAbsenceHours += row.absenceHours;
    }
  }

  const summary = Array.from(employees.values())
    .map((employee) => ({
      ...employee,
      workedHours: roundHours(employee.workedHours),
      breakAdjustmentHours: roundHours(employee.breakAdjustmentHours),
      sicknessHours: roundHours(employee.sicknessHours),
      vacationHours: roundHours(employee.vacationHours),
      feriefridageHours: roundHours(employee.feriefridageHours),
      publicHolidayHours: roundHours(employee.publicHolidayHours),
      otherAbsenceHours: roundHours(employee.otherAbsenceHours),
      adjustedPayableHours: roundHours(
        employee.workedHours +
          employee.breakAdjustmentHours +
          employee.sicknessHours +
          employee.vacationHours +
          employee.feriefridageHours +
          employee.publicHolidayHours +
          employee.otherAbsenceHours
      ),
    }))
    .sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }
      return a.firstName.localeCompare(b.firstName);
    });

  const audit = rows.map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    date: row.date,
    workedHours: roundHours(row.workedHours),
    breakHours: roundHours(row.breakHours),
    breakAdjustmentHours: roundHours(row.breakAdjustmentHours),
    absenceHours: roundHours(row.absenceHours),
    scheduledShiftHours: roundHours(row.scheduledShiftHours),
    rawRemark: row.remark,
    mappedCategory: row.absenceCategory,
    includedInPayableHours:
      row.workedHours > 0 || row.breakAdjustmentHours > 0 || row.absenceHours > 0
        ? 'Ja'
        : 'Nej',
  }));

  return { summary, audit };
}

async function buildWorkbook({ summary, audit, sourceFilename }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timeseddelbehandler';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Oversigt', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  const auditSheet = workbook.addWorksheet('Kontrol', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const periodLabel = derivePeriodLabel(sourceFilename);
  summarySheet.mergeCells('A1:J1');
  summarySheet.getCell('A1').value = `Lønoversigt${periodLabel ? ` (${periodLabel})` : ''}`;
  summarySheet.getCell('A1').font = { bold: true, size: 16 };
  summarySheet.getCell('A2').value =
    'Regel for pausejustering: Tilføj 0,25 timer for hver dateret række med registrerede arbejdstimer og pause.';
  summarySheet.getCell('A3').value = `Kildefil: ${sourceFilename || 'uploadet projektmappe'}`;

  summarySheet.columns = [
    { key: 'firstName', width: 18 },
    { key: 'lastName', width: 22 },
    { key: 'workedHours', width: 16 },
    { key: 'breakAdjustmentHours', width: 18 },
    { key: 'sicknessHours', width: 16 },
    { key: 'vacationHours', width: 16 },
    { key: 'feriefridageHours', width: 18 },
    { key: 'publicHolidayHours', width: 19 },
    { key: 'otherAbsenceHours', width: 18 },
    { key: 'adjustedPayableHours', width: 18 },
  ];

  const summaryHeaderRow = summarySheet.getRow(4);
  summaryHeaderRow.values = OUTPUT_COLUMNS;
  styleHeaderRow(summaryHeaderRow);

  for (const employee of summary) {
    summarySheet.addRow(employee);
  }

  auditSheet.columns = [
    { key: 'sourceRowNumber', width: 12 },
    { key: 'firstName', width: 18 },
    { key: 'lastName', width: 22 },
    { key: 'date', width: 14 },
    { key: 'workedHours', width: 14 },
    { key: 'breakHours', width: 14 },
    { key: 'breakAdjustmentHours', width: 18 },
    { key: 'absenceHours', width: 14 },
    { key: 'scheduledShiftHours', width: 15 },
    { key: 'rawRemark', width: 24 },
    { key: 'mappedCategory', width: 18 },
    { key: 'includedInPayableHours', width: 12 },
  ];
  auditSheet.getRow(1).values = [
    'Kilderække',
    'Fornavn',
    'Efternavn',
    'Dato',
    'Arbejdstimer',
    'Pausetimer',
    'Pausejustering',
    'Fraværstimer',
    'Planlagt vagt',
    'Rå bemærkning',
    'Kategori',
    'Medregnet',
  ];
  styleHeaderRow(auditSheet.getRow(1));

  for (const row of audit) {
    auditSheet.addRow(row);
  }

  applyNumberFormatting(summarySheet, 5, summarySheet.lastRow?.number || 4, [3, 4, 5, 6, 7, 8, 9, 10]);
  applyNumberFormatting(auditSheet, 2, auditSheet.lastRow?.number || 1, [5, 6, 7, 8, 9]);
  styleBody(summarySheet, 5, summarySheet.lastRow?.number || 4);
  styleBody(auditSheet, 2, auditSheet.lastRow?.number || 1);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function generateOutputFilename(inputFilename) {
  const periodLabel = derivePeriodLabel(inputFilename);
  return periodLabel
    ? `loenoversigt-${periodLabel.replace(/\s+/g, '_')}.xlsx`
    : 'loenoversigt.xlsx';
}

function derivePeriodLabel(filename = '') {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return '';
  }

  return `${match[1]} til ${match[2]}`;
}

function parseHourValue(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return roundHours(value);
  }

  const cleaned = String(value).trim().replace(',', '.');
  if (!cleaned) {
    return 0;
  }

  if (/^\d+:\d{2}$/.test(cleaned)) {
    const [hours, minutes] = cleaned.split(':').map(Number);
    return roundHours(hours + minutes / 60);
  }

  if (/^\d+\.\d{2}$/.test(cleaned)) {
    const [hoursPart, minutesPart] = cleaned.split('.');
    const minutes = Number(minutesPart);
    if (minutes < 60) {
      return roundHours(Number(hoursPart) + minutes / 60);
    }
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? roundHours(numeric) : 0;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function roundHours(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

function styleBody(sheet, startRow, endRow) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
  }
}

function applyNumberFormatting(sheet, startRow, endRow, columns) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    for (const column of columns) {
      sheet.getRow(rowNumber).getCell(column).numFmt = '0.00';
    }
  }
}

function createValidationError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'ValidationError';
  error.code = code;
  error.details = details;
  return error;
}

module.exports = {
  aggregateRows,
  buildWorkbook,
  derivePeriodLabel,
  generateOutputFilename,
  mapAbsenceCategory,
  normalizeRows,
  parseHourValue,
  parseWorkbook,
};
