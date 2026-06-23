import { NextRequest } from 'next/server';
import { read, utils, write } from 'xlsx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const timesheet = utils.sheet_to_json(worksheet);

    const processed = processTimesheet(timesheet);
    const newWb = utils.book_new();

    if (processed.kind === 'timetotoverview') {
      const overviewHeaders = [
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
        'Mødebonus berettiget',
      ];
      const overviewWs = utils.aoa_to_sheet([
        overviewHeaders,
        ...processed.overviewRows.map((row) => [
          row['Fornavn'],
          row['Efternavn'],
          row['Arbejdstimer'],
          row['Pausejustering'],
          row['Sygetimer'],
          row['Ferietimer'],
          row['Feriefridagstimer'],
          row['Helligdagstimer'],
          row['Øvrige fraværstimer'],
          row['Justerede løntimer'],
          row['Mødebonus berettiget'],
        ]),
      ]);
      overviewWs['!cols'] = overviewHeaders.map(() => ({ wch: 20 }));

      const controlHeaders = [
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
      const controlWs = utils.aoa_to_sheet([
        controlHeaders,
        ...processed.controlRows.map((row) => [
          row['Kilderække'],
          row['Fornavn'],
          row['Efternavn'],
          row['Dato'],
          row['Arbejdstimer'],
          row['Pausetimer'],
          row['Pausejustering'],
          row['Fraværstimer'],
          row['Planlagt vagt'],
          row['Rå bemærkning'],
          row['Kategori'],
          row['Medregnet'],
        ]),
      ]);
      controlWs['!cols'] = controlHeaders.map(() => ({ wch: 18 }));

      utils.book_append_sheet(newWb, overviewWs, 'Oversigt');
      utils.book_append_sheet(newWb, controlWs, 'Kontrol');
    } else {
      const headers = [
        'Fornavn',
        'Efternavn',
        'Arbejds Timer',
        'Sygdom Timer',
        'Ferie Timer',
        'Feriefridage Timer',
        'Tilføjede timer (Pause)',
        'Total Justerede Timer',
      ];
      const outputData = [
        headers,
        ...processed.rows.map((row) => [
          row['Fornavn'],
          row['Efternavn'],
          row['Arbejds Timer'],
          row['Sygdom Timer'],
          row['Ferie Timer'],
          row['Feriefridage Timer'],
          row['Tilføjede timer (Pause)'],
          row['Total Justerede Timer'],
        ]),
      ];

      const newWs = utils.aoa_to_sheet(outputData);
      newWs['!cols'] = headers.map(() => ({ wch: 20 }));
      utils.book_append_sheet(newWb, newWs, 'Processed Timesheet');
    }

    const outputBuffer = write(newWb, { bookType: 'xlsx', type: 'buffer' });

    return new Response(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=processed_timesheet.xlsx',
      },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Error processing file' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

type ProcessedTimesheet =
  | {
      kind: 'legacy';
      rows: Array<Record<string, any>>;
    }
  | {
      kind: 'timetotoverview';
      controlRows: Array<Record<string, any>>;
      overviewRows: Array<Record<string, any>>;
    };

type DayCategory = 'work' | 'sick' | 'vacation' | 'feriefridage' | 'holiday' | 'otherAbsence' | 'none';

type DayAggregate = {
  sourceRow: number;
  firstName: string;
  lastName: string;
  dateKey: string;
  dateDisplay: string;
  workedHours: number;
  breakHours: number;
  absenceHours: number;
  scheduledShift: number;
  remark: string;
};

type EmployeeTotals = {
  'Fornavn': string;
  'Efternavn': string;
  'Arbejdstimer': number;
  'Pausejustering': number;
  'Sygetimer': number;
  'Ferietimer': number;
  'Feriefridagstimer': number;
  'Helligdagstimer': number;
  'Øvrige fraværstimer': number;
};

function processTimesheet(timesheet: any[]): ProcessedTimesheet {
  if (looksLikeTimeMotoExport(timesheet)) {
    return processTimeMotoExport(timesheet);
  }

  return {
    kind: 'legacy',
    rows: processLegacyTimesheet(timesheet),
  };
}

function looksLikeTimeMotoExport(timesheet: any[]) {
  return timesheet.some((row) => 'Date' in row || 'Worked Hours' in row || 'Scheduled Shift' in row || 'Absence' in row || 'Remarks' in row);
}

function processLegacyTimesheet(timesheet: any[]) {
  let currentFirstName = '';
  let currentLastName = '';

  const data = timesheet.map((row) => {
    if (row['First Name']) currentFirstName = row['First Name'];
    if (row['Last Name']) currentLastName = row['Last Name'];

    return {
      'First Name': currentFirstName,
      'Last Name': currentLastName,
      'Total Hours': parseAmount(row['Total Hours']),
      'Base Hours': parseAmount(row['Base Hours']),
      'FerieTime': parseAmount(row['FerieTime']),
      'FeriefridageTime': parseAmount(row['FeriefridageTime']),
      'SygdomTime': parseAmount(row['SygdomTime']),
    };
  });

  const employeeData: Record<string, any> = {};

  data.forEach((row) => {
    const key = `${row['First Name']}-${row['Last Name']}`;
    if (!employeeData[key]) {
      employeeData[key] = {
        'Fornavn': row['First Name'],
        'Efternavn': row['Last Name'],
        'Arbejds Timer': 0,
        'Sygdom Timer': 0,
        'Ferie Timer': 0,
        'Feriefridage Timer': 0,
        'Tilføjede timer (Pause)': 0,
      };
    }

    employeeData[key]['Arbejds Timer'] += row['Total Hours'];
    employeeData[key]['Sygdom Timer'] += row['SygdomTime'];
    employeeData[key]['Ferie Timer'] += row['FerieTime'];
    employeeData[key]['Feriefridage Timer'] += row['FeriefridageTime'];
    if (row['Base Hours'] > 1) {
      employeeData[key]['Tilføjede timer (Pause)'] += 0.25;
    }
  });

  return Object.values(employeeData)
    .map((emp: any) => {
      emp['Total Justerede Timer'] = emp['Arbejds Timer'] + emp['Tilføjede timer (Pause)'];
      return emp;
    })
    .filter((emp: any) => emp['Fornavn'] && emp['Efternavn']);
}

function processTimeMotoExport(timesheet: any[]): ProcessedTimesheet {
  const groupedDays = new Map<string, DayAggregate>();
  let currentFirstName = '';
  let currentLastName = '';
  let currentDateKey = '';

  timesheet.forEach((row, index) => {
    if (row['First Name']) currentFirstName = String(row['First Name']).trim();
    if (row['Last Name']) currentLastName = String(row['Last Name']).trim();

    const explicitDateKey = parseDateKey(row['Date']);
    if (explicitDateKey) {
      currentDateKey = explicitDateKey;
    }

    const dateKey = explicitDateKey || currentDateKey;
    if (!currentFirstName || !currentLastName || !dateKey) {
      return;
    }

    const key = `${currentFirstName}__${currentLastName}__${dateKey}`;
    const aggregate = groupedDays.get(key) ?? {
      sourceRow: index + 2,
      firstName: currentFirstName,
      lastName: currentLastName,
      dateKey,
      dateDisplay: formatDateDisplay(row['Date'] ?? dateKey),
      workedHours: 0,
      breakHours: 0,
      absenceHours: 0,
      scheduledShift: 0,
      remark: '',
    };

    aggregate.workedHours += parseAmount(row['Worked Hours'] ?? row['WorkedHours'] ?? row['Total Hours']);
    aggregate.breakHours += parseAmount(row['Break']);
    aggregate.absenceHours += parseAmount(row['Absence']);
    aggregate.scheduledShift = Math.max(
      aggregate.scheduledShift,
      parseAmount(row['Scheduled Shift'] ?? row['ScheduledShift'] ?? row['Base Hours'])
    );

    const rawRemark = String(row['Remarks'] ?? row['Remark'] ?? row['Comments'] ?? '').trim();
    if (rawRemark) {
      aggregate.remark = aggregate.remark || rawRemark;
    }

    groupedDays.set(key, aggregate);
  });

  const controlRows = Array.from(groupedDays.values())
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.dateKey.localeCompare(b.dateKey))
    .map((day) => {
      const category = classifyDay(day.dateKey, day.remark, day.absenceHours);
      const pauseAdjustment = day.workedHours > 0 && day.breakHours > 0 ? 0.25 : 0;
      const absenceHours = category === 'work' ? 0 : day.absenceHours;
      return {
        'Kilderække': day.sourceRow,
        'Fornavn': day.firstName,
        'Efternavn': day.lastName,
        'Dato': day.dateDisplay,
        'Arbejdstimer': round2(day.workedHours),
        'Pausetimer': round2(day.breakHours),
        'Pausejustering': round2(pauseAdjustment),
        'Fraværstimer': round2(absenceHours),
        'Planlagt vagt': round2(day.scheduledShift || (day.workedHours + day.breakHours)),
        'Rå bemærkning': day.remark,
        'Kategori': category,
        'Medregnet': day.workedHours > 0 || day.absenceHours > 0 ? 'Ja' : 'Nej',
      };
    });

  const overview = new Map<string, EmployeeTotals>();
  controlRows.forEach((row) => {
    const key = `${row['Fornavn']}__${row['Efternavn']}`;
    const bucket = overview.get(key) ?? {
      'Fornavn': row['Fornavn'],
      'Efternavn': row['Efternavn'],
      'Arbejdstimer': 0,
      'Pausejustering': 0,
      'Sygetimer': 0,
      'Ferietimer': 0,
      'Feriefridagstimer': 0,
      'Helligdagstimer': 0,
      'Øvrige fraværstimer': 0,
    };

    switch (row['Kategori']) {
      case 'sick':
        bucket['Sygetimer'] += row['Fraværstimer'];
        break;
      case 'vacation':
        bucket['Ferietimer'] += row['Fraværstimer'];
        break;
      case 'feriefridage':
        bucket['Feriefridagstimer'] += row['Fraværstimer'];
        break;
      case 'holiday':
        bucket['Helligdagstimer'] += row['Fraværstimer'];
        break;
      case 'otherAbsence':
        bucket['Øvrige fraværstimer'] += row['Fraværstimer'];
        break;
      default:
        break;
    }

    bucket['Arbejdstimer'] += row['Arbejdstimer'];
    bucket['Pausejustering'] += row['Pausejustering'];
    overview.set(key, bucket);
  });

  const overviewRows = Array.from(overview.values())
    .sort((a, b) => a['Fornavn'].localeCompare(b['Fornavn']) || a['Efternavn'].localeCompare(b['Efternavn']))
    .map((row) => {
      const total =
        row['Arbejdstimer'] +
        row['Pausejustering'] +
        row['Sygetimer'] +
        row['Ferietimer'] +
        row['Feriefridagstimer'] +
        row['Helligdagstimer'] +
        row['Øvrige fraværstimer'];

      return {
        'Fornavn': row['Fornavn'],
        'Efternavn': row['Efternavn'],
        'Arbejdstimer': round2(row['Arbejdstimer']),
        'Pausejustering': round2(row['Pausejustering']),
        'Sygetimer': round2(row['Sygetimer']),
        'Ferietimer': round2(row['Ferietimer']),
        'Feriefridagstimer': round2(row['Feriefridagstimer']),
        'Helligdagstimer': round2(row['Helligdagstimer']),
        'Øvrige fraværstimer': round2(row['Øvrige fraværstimer']),
        'Justerede løntimer': round2(total),
        'Mødebonus berettiget': total >= 168 ? 'Ja' : 'Nej',
      };
    });

  return {
    kind: 'timetotoverview',
    controlRows,
    overviewRows,
  };
}

function classifyDay(dateKey: string, remark: string, absenceHours: number): DayCategory {
  const normalizedRemark = normalizeText(remark);

  if (containsAny(normalizedRemark, SICK_MARKERS)) {
    return 'sick';
  }

  if (containsAny(normalizedRemark, FERIEFRIDAGE_MARKERS)) {
    return 'feriefridage';
  }

  if (containsAny(normalizedRemark, VACATION_MARKERS)) {
    return 'vacation';
  }

  if (containsAny(normalizedRemark, HOLIDAY_MARKERS) || isDanishPublicHoliday(dateKey)) {
    return 'holiday';
  }

  if (containsAny(normalizedRemark, OTHER_ABSENCE_MARKERS)) {
    return 'otherAbsence';
  }

  if (absenceHours > 0) {
    return 'otherAbsence';
  }

  return 'work';
}

const SICK_MARKERS = ['syg', 'sygedag', 'syge', 'sick', 'sick leave', 'sickness'];
const VACATION_MARKERS = ['ferie', 'vacation', 'annual leave', 'paid leave', 'holiday leave'];
const FERIEFRIDAGE_MARKERS = ['feriefridag', 'feriefridage', 'personal holiday', 'floating holiday', 'special holiday'];
const HOLIDAY_MARKERS = [
  'helligdag',
  'helligdage',
  'holiday',
  'public holiday',
  'bank holiday',
  'ascension day',
  'whit monday',
  'white monday',
  'whit sunday',
  'whitsun monday',
  'pentecost monday',
  'christmas day',
  '2nd christmas day',
  '2. pinsedag',
  '2 pinsedag',
  '2nd whitsun day',
  '2nd pentecost day',
  'second pentecost day',
];
const OTHER_ABSENCE_MARKERS = ['ubetalte fridage', 'unpaid leave', 'unpaid holiday', 'unpaid absence'];

function containsAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parseDateKey(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = excelSerialToDate(value);
    return date ? date.toISOString().slice(0, 10) : '';
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';

    const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      const day = Number(ddmmyyyy[1]);
      const month = Number(ddmmyyyy[2]);
      const year = Number(ddmmyyyy[3]);
      return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    }

    const yyyyMmDd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyyMmDd) {
      return text;
    }
  }

  return '';
}

function formatDateDisplay(value: unknown) {
  if (typeof value === 'string') {
    const ddmmyyyy = value.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[1].padStart(2, '0')}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[3]}`;
    }
    return value;
  }

  const key = parseDateKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}-${month}-${year}`;
}

function excelSerialToDate(serial: number) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + serial * millisecondsPerDay);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDanishPublicHoliday(dateKey: string) {
  if (!dateKey) return false;

  const [yearStr] = dateKey.split('-');
  const year = Number(yearStr);
  if (!year) return false;

  return getDanishPublicHolidayKeys(year).has(dateKey);
}

function getDanishPublicHolidayKeys(year: number) {
  const easterSunday = getEasterSunday(year);
  const holidayDates = [
    `${year}-01-01`,
    formatDateKey(addDays(easterSunday, -3)),
    formatDateKey(addDays(easterSunday, -2)),
    formatDateKey(addDays(easterSunday, 1)),
    formatDateKey(addDays(easterSunday, 39)),
    formatDateKey(addDays(easterSunday, 50)),
    `${year}-12-25`,
    `${year}-12-26`,
  ];

  return new Set(holidayDates);
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
