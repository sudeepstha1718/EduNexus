import NepaliDate from 'nepali-date-converter';

export interface DualDateInfo {
  adDate: string; // e.g. "2026-09-15"
  adFormatted: string; // e.g. "Sep 15, 2026"
  adDayOfWeek: string; // e.g. "Tuesday"
  bsDate: string; // e.g. "2083-05-30"
  bsFormatted: string; // e.g. "2083 Bhadra 30 BS"
  bsDevanagari: string; // e.g. "२०८३ भाद्र ३०"
  bsMonthName: string; // e.g. "Bhadra" / "भाद्र"
  combinedLabel: string; // e.g. "Sep 15, 2026 AD • २०८३ भाद्र ३० BS"
}

// Convert western digits (0-9) to Nepali Devanagari numerals (०-९)
export const toNepaliNumerals = (input: string | number): string => {
  const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return String(input).replace(/[0-9]/g, (digit) => nepaliDigits[parseInt(digit, 10)]);
};

// Nepali Bikram Sambat months reference
export const NEPALI_MONTHS = [
  { index: 0, enName: 'Baishakh', npName: 'बैशाख' },
  { index: 1, enName: 'Jestha', npName: 'जेठ' },
  { index: 2, enName: 'Ashadh', npName: 'असार' },
  { index: 3, enName: 'Shrawan', npName: 'साउन' },
  { index: 4, enName: 'Bhadra', npName: 'भदौ' },
  { index: 5, enName: 'Ashwin', npName: 'असोज' },
  { index: 6, enName: 'Kartik', npName: 'कात्तिक' },
  { index: 7, enName: 'Mangsir', npName: 'मंसिर' },
  { index: 8, enName: 'Poush', npName: 'पुस' },
  { index: 9, enName: 'Magh', npName: 'माघ' },
  { index: 10, enName: 'Falgun', npName: 'फागुन' },
  { index: 11, enName: 'Chaitra', npName: 'चैत' },
];

/**
 * Safely parse date and format both English AD and Nepali BS
 */
export const getDualDate = (adDateStr?: string, customBsStr?: string): DualDateInfo => {
  let dateObj = new Date();
  if (adDateStr) {
    // Append time component if only date is passed to avoid timezone shifts
    const cleanStr = adDateStr.includes('T') ? adDateStr : `${adDateStr}T12:00:00`;
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  }

  // Format English Date
  const year = dateObj.getFullYear();
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const adFormatted = `${monthNamesShort[dateObj.getMonth()]} ${dateObj.getDate()}, ${year}`;
  const adDayOfWeek = dayNames[dateObj.getDay()];
  const adDate = dateObj.toISOString().slice(0, 10);

  // If custom BS string is provided and valid, use it
  if (customBsStr && customBsStr.trim()) {
    return {
      adDate,
      adFormatted,
      adDayOfWeek,
      bsDate: customBsStr.trim(),
      bsFormatted: `${customBsStr.trim()} BS`,
      bsDevanagari: toNepaliNumerals(customBsStr.trim()),
      bsMonthName: '',
      combinedLabel: `${adFormatted} AD • ${customBsStr.trim()} BS`,
    };
  }

  try {
    const Ctor = (NepaliDate as any)?.default || NepaliDate;
    const nepDate = new Ctor(dateObj);
    const bsYear = nepDate.getYear();
    const bsMonth = nepDate.getMonth(); // 0-indexed
    const bsDay = nepDate.getDate();

    const monthMeta = NEPALI_MONTHS[bsMonth] || NEPALI_MONTHS[0];
    const bsMonthFormatted = monthMeta.enName;
    const bsFormatted = `${bsYear} ${bsMonthFormatted} ${bsDay} BS`;
    const bsDevanagari = `${toNepaliNumerals(bsYear)} ${monthMeta.npName} ${toNepaliNumerals(bsDay)}`;
    const paddedMonth = String(bsMonth + 1).padStart(2, '0');
    const paddedDay = String(bsDay).padStart(2, '0');
    const bsDate = `${bsYear}-${paddedMonth}-${paddedDay}`;

    return {
      adDate,
      adFormatted,
      adDayOfWeek,
      bsDate,
      bsFormatted,
      bsDevanagari,
      bsMonthName: bsMonthFormatted,
      combinedLabel: `${adFormatted} AD • ${bsFormatted} (${bsDevanagari})`,
    };
  } catch {
    // Fallback mathematical approximation (+56 years 8 months 15 days)
    const fallbackYear = year + 57;
    return {
      adDate,
      adFormatted,
      adDayOfWeek,
      bsDate: `${fallbackYear}-05-15`,
      bsFormatted: `${fallbackYear} BS`,
      bsDevanagari: `${toNepaliNumerals(fallbackYear)} BS`,
      bsMonthName: '',
      combinedLabel: `${adFormatted} AD • ${fallbackYear} BS`,
    };
  }
};

/**
 * Convert English Date (YYYY-MM-DD) to formatted BS String
 */
export const adToBsString = (adDateStr: string): string => {
  const info = getDualDate(adDateStr);
  return info.bsFormatted;
};

/**
 * Check if a date string is today
 */
export const isAdToday = (adDateStr: string): boolean => {
  if (!adDateStr) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return adDateStr === todayStr;
};

/**
 * Check if a date string is in the future
 */
export const isAdFuture = (adDateStr: string): boolean => {
  if (!adDateStr) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return adDateStr > todayStr;
};
