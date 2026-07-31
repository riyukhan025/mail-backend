/**
 * A mapping of common Unicode confusable characters, smart punctuation, and other
 * symbols to their standard ASCII equivalents.
 */
const CONFUSABLES_MAP = {
  // Cyrillic characters that look like Latin letters
  А: "A", а: "a", В: "B", Е: "E", е: "e", К: "K",
  М: "M", Н: "H", О: "O", о: "o", Р: "P", р: "p",
  С: "C", с: "c", Т: "T", Х: "X", х: "x",

  // Greek characters
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K",
  Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",

  // Smart quotes and dashes
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-",

  // Other common symbols
  "…": "...", "™": "TM", "®": "(R)", "©": "(C)",
};

/**
 * A regular expression to find and remove problematic invisible Unicode characters.
 * This includes:
 * - Zero-width spaces and joiners (\u200B-\u200D)
 * - Byte Order Mark (BOM) (\uFEFF)
 * - Other format-control characters (\u200E, \u200F, \u202A-\u202E)
 * - Unsupported control characters from C0 and C1 blocks, preserving tab, newline, and carriage return.
 */
const INVISIBLE_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF\u200B-\u200D\u200E\u200F\u202A-\u202E]/g;

/**
 * Sanitizes imported text by normalizing Unicode, replacing confusable characters,
 * cleaning punctuation, and removing invisible/control characters.
 *
 * @param {any} text The input text to sanitize.
 * @returns {string} The sanitized text.
 */
export function sanitizeImportedText(text) {
  let count = 0;

  // 1. Ensure input is a string and handle null/undefined cases.
  if (text === null || typeof text === "undefined") {
    return { sanitized: "", count: 0 };
  }
  let sanitizedText = String(text);

  // 2. Perform initial replacements for common confusables and punctuation.
  // This is a fast path for the most frequent issues.
  for (const char in CONFUSABLES_MAP) {
    const regex = new RegExp(char, "g");
    const matches = (sanitizedText.match(regex) || []).length;
    if (matches > 0) {
      count += matches;
      sanitizedText = sanitizedText.replace(regex, CONFUSABLES_MAP[char]);
    }
  }

  // 3. Apply NFKC Unicode normalization.
  // This is a powerful step that collapses many character variations (e.g., ligatures like 'ﬁ' -> 'fi')
  // into their canonical forms, which helps with consistency.
  const normalized = sanitizedText.normalize("NFKC");
  if (sanitizedText !== normalized) {
    // This is a broad count but indicates normalization occurred.
    count += (sanitizedText.match(/[\uFB00-\uFB06]/g) || []).length; // Count common ligatures
    sanitizedText = normalized;
  }

  // 4. Replace non-breaking spaces with regular spaces.
  const nbspRegex = /\u00A0/g;
  count += (sanitizedText.match(nbspRegex) || []).length;
  sanitizedText = sanitizedText.replace(nbspRegex, " ");

  // 5. Remove invisible characters and unsupported control characters.
  count += (sanitizedText.match(INVISIBLE_CHARS_REGEX) || []).length;
  sanitizedText = sanitizedText.replace(INVISIBLE_CHARS_REGEX, "");

  // 6. Handle any remaining non-printable or unexpected characters.
  // This regex keeps printable ASCII, common Latin-1 supplements, and basic currency/punctuation.
  // Anything else that wasn't normalized or replaced is considered unsafe and replaced with '?'.
  const unsupportedRegex = /[^ -~¡-ÿ]/g;
  count += (sanitizedText.match(unsupportedRegex) || []).length;
  sanitizedText = sanitizedText.replace(unsupportedRegex, "?");

  // 7. Trim whitespace from the start and end of the string.
  sanitizedText = sanitizedText.trim();

  // 8. Collapse multiple consecutive spaces into a single space.
  sanitizedText = sanitizedText.replace(/\s+/g, " ");

  return { sanitized: sanitizedText, count };
}

/**
 * A wrapper function to sanitize all string properties within an object.
 * This is useful for cleaning entire data rows from Excel/CSV imports.
 *
 * @param {object} dataObject The object to sanitize.
 * @returns {object} A new object with all string values sanitized.
 */
export function sanitizeObjectStrings(dataObject) {
  let totalCount = 0;
  if (typeof dataObject !== 'object' || dataObject === null) {
    return { sanitizedObject: dataObject, totalCount: 0 };
  }

  const sanitizedObject = {};
  for (const key in dataObject) {
    if (Object.prototype.hasOwnProperty.call(dataObject, key)) {
      const value = dataObject[key];
      if (typeof value === 'string') {
        const { sanitized, count } = sanitizeImportedText(value);
        sanitizedObject[key] = sanitized;
        totalCount += count;
      } else {
        sanitizedObject[key] = value; // Keep non-string values as-is
      }
    }
  }

  return { sanitizedObject, totalCount };
}

export default sanitizeImportedText;