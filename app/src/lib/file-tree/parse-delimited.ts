import * as Path from 'path'

/** A delimited-text format the viewer can render as a table. */
export type DelimitedKind = {
  /** The field separator, e.g. ',' for CSV or '\t' for TSV. */
  readonly delimiter: string
}

/** Extensions rendered as a table, mapped to their field delimiter. */
const DelimitedExtensions = new Map<string, string>([
  ['.csv', ','],
  ['.tsv', '\t'],
])

/**
 * The delimiter for a path the viewer should render as a table, or null when it
 * isn't a recognised delimited-text file.
 */
export function getDelimitedKind(filePath: string): DelimitedKind | null {
  const delimiter = DelimitedExtensions.get(
    Path.extname(filePath).toLowerCase()
  )
  return delimiter === undefined ? null : { delimiter }
}

/**
 * Parse delimited text (CSV/TSV) into rows of fields following RFC 4180:
 * fields may be wrapped in double quotes, `""` is a literal quote, and quoted
 * fields may contain the delimiter and newlines. A single trailing newline does
 * not produce an extra empty row.
 */
export function parseDelimited(
  text: string,
  delimiter: string
): ReadonlyArray<ReadonlyArray<string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }

    if (char === '\n' || char === '\r') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      // Treat \r\n as a single line break.
      i += char === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }

    field += char
    i++
  }

  // Flush the final field/row unless the text ended exactly on a line break.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}
