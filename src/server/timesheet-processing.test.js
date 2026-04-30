const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  aggregateRows,
  generateOutputFilename,
  mapAbsenceCategory,
  normalizeRows,
  parseHourValue,
  parseWorkbook,
} = require('./timesheet-processing');

function buildWorkbookBuffer(rows, sheetName = 'Timesheet') {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('parseHourValue converts hh.mm and hh:mm values to decimal hours', () => {
  assert.equal(parseHourValue('7.40'), 7.67);
  assert.equal(parseHourValue('0.47'), 0.78);
  assert.equal(parseHourValue('7:30'), 7.5);
  assert.equal(parseHourValue('2.5'), 2.5);
});

test('normalizeRows forward-fills names and filters empty continuation rows', () => {
  const rows = normalizeRows([
    {
      'First Name': 'Gitte',
      'Last Name': 'Ekmajer',
      Date: '20-03-2026',
      'Worked Hours': '7.00',
      Break: '0.47',
      Absence: '0.00',
      Remarks: '',
      'Scheduled Shift': '7.40',
    },
    {
      'First Name': '',
      'Last Name': '',
      Date: '',
      'Worked Hours': '',
      Break: '',
      Absence: '',
      Remarks: '',
      'Scheduled Shift': '',
    },
    {
      'First Name': '',
      'Last Name': '',
      Date: '21-03-2026',
      'Worked Hours': '0.00',
      Break: '0.00',
      Absence: '7.40',
      Remarks: 'Good Friday',
      'Scheduled Shift': '7.40',
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[1].firstName, 'Gitte');
  assert.equal(rows[1].lastName, 'Ekmajer');
  assert.equal(rows[1].absenceCategory, 'publicHoliday');
});

test('mapAbsenceCategory maps feriefridage, public holidays, and unknown remarks', () => {
  assert.equal(mapAbsenceCategory('Feriefridage', 8), 'feriefridage');
  assert.equal(mapAbsenceCategory('Maundy Thursday', 7.67), 'publicHoliday');
  assert.equal(mapAbsenceCategory('Sygdom', 4), 'sickness');
  assert.equal(mapAbsenceCategory('Something New', 2), 'otherAbsence');
  assert.equal(mapAbsenceCategory('', 0), 'none');
});

test('aggregateRows reconciles worked time, absence buckets, and break adjustment', () => {
  const rows = normalizeRows([
    {
      'First Name': 'Elena',
      'Last Name': 'Nichita',
      Date: '01-04-2026',
      'Worked Hours': '8.00',
      Break: '0.30',
      Absence: '0.00',
      Remarks: '',
      'Scheduled Shift': '8.00',
    },
    {
      'First Name': 'Elena',
      'Last Name': 'Nichita',
      Date: '02-04-2026',
      'Worked Hours': '0.00',
      Break: '0.00',
      Absence: '8.00',
      Remarks: 'Maundy Thursday',
      'Scheduled Shift': '8.00',
    },
    {
      'First Name': 'Elena',
      'Last Name': 'Nichita',
      Date: '03-04-2026',
      'Worked Hours': '0.00',
      Break: '0.00',
      Absence: '8.00',
      Remarks: 'Feriefridage',
      'Scheduled Shift': '8.00',
    },
  ]);

  const { summary, audit } = aggregateRows(rows);

  assert.equal(summary.length, 1);
  assert.deepEqual(summary[0], {
    firstName: 'Elena',
    lastName: 'Nichita',
    workedHours: 8,
    breakAdjustmentHours: 0.25,
    sicknessHours: 0,
    vacationHours: 0,
    feriefridageHours: 8,
    publicHolidayHours: 8,
    otherAbsenceHours: 0,
    adjustedPayableHours: 24.25,
  });
  assert.equal(audit.length, 3);
  assert.equal(audit[1].mappedCategory, 'publicHoliday');
  assert.equal(audit[2].mappedCategory, 'feriefridage');
});

test('parseWorkbook validates required sheet and columns', () => {
  assert.throws(
    () => parseWorkbook(buildWorkbookBuffer([{ foo: 'bar' }], 'WrongSheet')),
    (error) => error.name === 'ValidationError' && error.code === 'missing_sheet'
  );

  assert.throws(
    () =>
      parseWorkbook(
        buildWorkbookBuffer([
          {
            'First Name': 'A',
            'Last Name': 'B',
          },
        ])
      ),
    (error) =>
      error.name === 'ValidationError' &&
      error.code === 'missing_columns' &&
      Array.isArray(error.details?.missingColumns)
  );
});

test('generateOutputFilename uses pay period from uploaded file name', () => {
  assert.equal(
    generateOutputFilename('Timesheet 2026-03-20 - 2026-04-19.xlsx'),
    'loenoversigt-2026-03-20_til_2026-04-19.xlsx'
  );
  assert.equal(generateOutputFilename('timesheet.xlsx'), 'loenoversigt.xlsx');
});
