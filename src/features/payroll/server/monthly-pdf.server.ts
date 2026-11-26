import '@tanstack/react-start/server-only'
import { Readable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import PDFDocument from 'pdfkit'
import { APP_NAME } from '#/lib/app'
import { formatGeorgianMonth } from '#/lib/date-format'
import {
  monthlyPayrollColumns,
  monthlyPayrollExportStages,
} from '../monthly.rules'
import fontData from './fonts/NotoSansGeorgian.ttf?inline'
import type { MonthlyDirectory } from '../monthly.types'

const font = Buffer.from(fontData.slice(fontData.indexOf(',') + 1), 'base64')
const margin = 32
const padding = 4
const bodySize = 9
const amountFormat = new Intl.NumberFormat('ka', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

export function streamMonthlyPayrollPdf(report: MonthlyDirectory) {
  const title = 'თვის ხელფასები'
  const month = formatGeorgianMonth(report.month)
  const period = {
    all: 'მთელი თვე',
    first: 'პირველი ნაწილი (1/2)',
    salary: 'მეორე ნაწილი (2/2)',
  }[report.period]
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin,
    lang: 'ka',
    info: { Title: `${title} - ${report.month}`, Author: APP_NAME },
  }).font(font)
  const width = doc.page.width - 2 * margin
  const amountColumns = monthlyPayrollColumns(report.period)
  const stages = monthlyPayrollExportStages(report)
  const nameWidth = stages.length === 1 ? 230 : 115
  const dateWidth = 105
  const amountWidth =
    (width - nameWidth - stages.length * dateWidth) / (amountColumns.length + 1)
  const columns = [
    { label: 'თანამშრომელი', width: nameWidth, align: 'left', size: bodySize },
    ...[...amountColumns.map(([, label]) => label), 'გაცემული თანხა'].map(
      (label) =>
        ({
          label: label.replace('(', '\n('),
          width: amountWidth,
          align: 'right',
          size: bodySize,
        }) as const,
    ),
    ...stages.map(
      ([, label]) =>
        ({ label, width: dateWidth, align: 'center', size: 8 }) as const,
    ),
  ] as const
  const amount = (minor: number | null) =>
    minor === null ? '-' : amountFormat.format(minor / 100)
  const cellWidth = (index: number) => columns[index].width - 2 * padding
  const rowHeight = (cells: string[]) =>
    Math.max(
      ...cells.map((cell, index) =>
        doc.fontSize(columns[index].size).heightOfString(cell, {
          width: cellWidth(index),
        }),
      ),
    ) +
    2 * padding
  const isCancelled = () => doc.destroyed

  let page = 0
  let y = margin

  function drawRow(
    cells: string[],
    height: number,
    shaded: boolean,
    header = false,
  ) {
    if (shaded)
      doc.rect(margin, y, width, height).fill(header ? '#e5ebe8' : '#f4f6f5')
    let x = margin
    doc.fillColor('#182822')
    for (const [index, column] of columns.entries()) {
      doc.fontSize(column.size).text(cells[index], x + padding, y + padding, {
        width: cellWidth(index),
        align: column.align,
      })
      x += column.width
    }
    y += height
  }

  function drawPageHeader() {
    page++
    doc.fillColor('#3e6054').fontSize(10).text(APP_NAME, margin, margin)
    doc
      .fillColor('#182822')
      .fontSize(20)
      .text(title, margin, margin + 18)
    doc
      .fillColor('#3e6054')
      .fontSize(10)
      .text(`${month}  /  ${period}  /  თანხები ₾-ში`, margin, margin + 49)
    doc
      .fontSize(bodySize)
      .text(
        'ზედა ხაზზე დაგეგმილი პერიოდია, ქვედაზე კი გაცემის თარიღი.',
        margin,
        margin + 66,
      )
    doc.fontSize(bodySize).text(`გვერდი ${page}`, margin, margin + 2, {
      width,
      align: 'right',
    })
    y = margin + 86
    const labels = columns.map(({ label }) => label)
    drawRow(labels, rowHeight(labels), true, true)
  }

  async function render() {
    await setImmediate()
    if (isCancelled()) return
    drawPageHeader()
    if (!report.records.length) {
      doc
        .fontSize(bodySize)
        .text('შესაბამისი ჩანაწერი არ მოიძებნა', margin + padding, y + padding)
    }
    for (const [index, row] of report.records.entries()) {
      const cells = [
        row.employeeName.replace(/\s+/gu, ' '),
        ...amountColumns.map(([key]) => amount(row[key])),
        amount(row.paidMinor),
        ...stages.map(([stage]) => {
          const dates = row.payoutDates[stage]
          const planned =
            dates?.start === dates?.end
              ? dates?.start
              : [dates?.start, dates?.end].filter(Boolean).join(' - ')
          return `${planned || '-'}\n${dates?.paidOn ?? '-'}`
        }),
      ]
      const height = rowHeight(cells)
      if (y + height > doc.page.height - margin) {
        // Yield between pages so large exports leave time for other requests.
        await setImmediate()
        if (isCancelled()) return
        doc.addPage()
        drawPageHeader()
      }
      drawRow(cells, height, index % 2 === 1)
    }
    doc.end()
  }

  const stream = Readable.toWeb(doc)
  void render().catch((error: unknown) => {
    doc.destroy(
      error instanceof Error ? error : new Error('PDF rendering failed'),
    )
  })
  return stream
}
