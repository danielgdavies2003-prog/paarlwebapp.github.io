using ClosedXML.Excel;
using TheatreLunchWeb.Models;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/lunch-entry", async (LunchEntry entry) =>
{
    try
    {
        var filePath = Path.Combine(app.Environment.ContentRootPath, "Data", "TheatreLunchBreak.xlsx");

        if (!File.Exists(filePath))
        {
            return Results.NotFound(new { message = "Excel file not found." });
        }

        using var workbook = new XLWorkbook(filePath);

        var targetDate = DateTime.Parse(entry.Date);

        // 1. Make sure all sheets contain the date block
        EnsureDateBlocksExistForAllSheets(workbook, targetDate);

        // 2. Get the selected theatre sheet
        if (!workbook.TryGetWorksheet(entry.Theatre, out var worksheet))
        {
            return Results.BadRequest(new { message = $"Sheet '{entry.Theatre}' not found." });
        }

        var lunchOutTime = TimeSpan.Parse(entry.LunchOut);
        var backInTime = TimeSpan.Parse(entry.BackIn);

        // 3. Find the correct date block in that sheet
        int? dateRow = FindDateRow(worksheet, targetDate);

        if (dateRow == null)
        {
            return Results.BadRequest(new { message = $"Date block for {targetDate:yyyy-MM-dd} not found in {entry.Theatre}." });
        }

        int headerRow = dateRow.Value + 1;
        int firstRoleRow = headerRow + 1;
        int footerRow = FindFooterRow(worksheet, firstRoleRow);

        if (footerRow == -1)
        {
            return Results.BadRequest(new { message = "Could not find footer row." });
        }

        int? roleRow = null;

        for (int row = firstRoleRow; row < footerRow; row++)
        {
            var roleText = worksheet.Cell(row, 1).GetString().Trim();

            if (roleText.Equals(entry.Role, StringComparison.OrdinalIgnoreCase))
            {
                roleRow = row;
                break;
            }
        }

        if (roleRow == null)
        {
            return Results.BadRequest(new { message = $"Role '{entry.Role}' not found for {entry.Theatre} on {targetDate:yyyy-MM-dd}." });
        }

        // 4. Write Lunch Out / Back In
        worksheet.Cell(roleRow.Value, 2).Value = lunchOutTime;
        worksheet.Cell(roleRow.Value, 3).Value = backInTime;

        worksheet.Cell(roleRow.Value, 2).Style.DateFormat.Format = "hh:mm";
        worksheet.Cell(roleRow.Value, 3).Style.DateFormat.Format = "hh:mm";

        // 5. Recalculate Time Taken for Lunch
        worksheet.Cell(roleRow.Value, 4).FormulaA1 =
            $"=IF(AND(B{roleRow.Value}>0,C{roleRow.Value}>0),C{roleRow.Value}-B{roleRow.Value},0)";
        worksheet.Cell(roleRow.Value, 4).Style.DateFormat.Format = "hh:mm";

        // 6. Recalculate footer
        worksheet.Cell(footerRow, 2).FormulaA1 =
            $"=IF(COUNTA(B{firstRoleRow}:C{footerRow - 1})=0,0,MAX(C{firstRoleRow}:C{footerRow - 1})-MINIFS(B{firstRoleRow}:B{footerRow - 1},B{firstRoleRow}:B{footerRow - 1},\">0\"))";
        worksheet.Cell(footerRow, 2).Style.DateFormat.Format = "hh:mm";

        workbook.Save();

        return Results.Ok(new
        {
            message = "Lunch times saved successfully.",
            theatre = entry.Theatre,
            date = targetDate.ToString("yyyy-MM-dd"),
            role = entry.Role
        });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.Run();


// =======================
// HELPER METHODS
// =======================

static void EnsureDateBlocksExistForAllSheets(XLWorkbook workbook, DateTime targetDate)
{
    foreach (var worksheet in workbook.Worksheets)
    {
        if (worksheet.Name.StartsWith("T", StringComparison.OrdinalIgnoreCase))
        {
            EnsureDateBlocksExistForSheet(worksheet, targetDate);
        }
    }
}

static void EnsureDateBlocksExistForSheet(IXLWorksheet worksheet, DateTime targetDate)
{
    var blocks = GetDateBlocks(worksheet).OrderBy(b => b.Date).ToList();

    if (blocks.Count == 0)
        return;

    var latestBlock = blocks.Last();
    var latestDate = latestBlock.Date.Date;

    if (targetDate.Date <= latestDate)
        return;

    // Use the spacing between the last two date blocks if available
    int blockHeight;
    if (blocks.Count >= 2)
    {
        blockHeight = blocks[^1].DateRow - blocks[^2].DateRow;
    }
    else
    {
        // fallback if there's only one block
        blockHeight = 7;
    }

    int templateStartRow = latestBlock.DateRow;

    for (var d = latestDate.AddDays(1); d <= targetDate.Date; d = d.AddDays(1))
    {
        // Skip weekends to match your existing workbook pattern
        if (d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday)
            continue;

        int newStartRow = templateStartRow + blockHeight;

        // Copy the previous block
        var sourceRange = worksheet.Range(templateStartRow, 1, templateStartRow + blockHeight - 1, 4);
        sourceRange.CopyTo(worksheet.Cell(newStartRow, 1));

        // Set the new date
        worksheet.Cell(newStartRow, 1).Value = "Date:";
        worksheet.Cell(newStartRow, 2).Value = d;
        worksheet.Cell(newStartRow, 2).Style.DateFormat.Format = "dd/MM/yyyy";

        int headerRow = newStartRow + 1;
        int firstRoleRow = headerRow + 1;
        int footerRow = FindFooterRowWithinBlock(worksheet, firstRoleRow, newStartRow + blockHeight - 1);

        if (footerRow == -1)
        {
            footerRow = newStartRow + blockHeight - 1;
        }

        // Clear times and reset formulas
        for (int row = firstRoleRow; row < footerRow; row++)
        {
            worksheet.Cell(row, 2).Value = 0;
            worksheet.Cell(row, 3).Value = 0;

            worksheet.Cell(row, 2).Style.DateFormat.Format = "hh:mm";
            worksheet.Cell(row, 3).Style.DateFormat.Format = "hh:mm";

            worksheet.Cell(row, 4).FormulaA1 =
                $"=IF(AND(B{row}>0,C{row}>0),C{row}-B{row},0)";
            worksheet.Cell(row, 4).Style.DateFormat.Format = "hh:mm";
        }

        // Reset footer formula
        worksheet.Cell(footerRow, 2).FormulaA1 =
            $"=IF(COUNTA(B{firstRoleRow}:C{footerRow - 1})=0,0,MAX(C{firstRoleRow}:C{footerRow - 1})-MINIFS(B{firstRoleRow}:B{footerRow - 1},B{firstRoleRow}:B{footerRow - 1},\">0\"))";
        worksheet.Cell(footerRow, 2).Style.DateFormat.Format = "hh:mm";

        // Move template pointer forward
        templateStartRow = newStartRow;
    }
}

static List<DateBlockInfo> GetDateBlocks(IXLWorksheet worksheet)
{
    var result = new List<DateBlockInfo>();
    var usedRange = worksheet.RangeUsed();

    if (usedRange == null)
        return result;

    foreach (var row in usedRange.Rows())
    {
        var firstCell = worksheet.Cell(row.RowNumber(), 1).GetString().Trim();

        if (firstCell.Equals("Date:", StringComparison.OrdinalIgnoreCase))
        {
            var date = TryReadDateFromRow(worksheet, row.RowNumber());

            if (date != null)
            {
                result.Add(new DateBlockInfo
                {
                    DateRow = row.RowNumber(),
                    Date = date.Value
                });
            }
        }
    }

    return result;
}

static int? FindDateRow(IXLWorksheet worksheet, DateTime targetDate)
{
    var blocks = GetDateBlocks(worksheet);

    foreach (var block in blocks)
    {
        if (block.Date.Date == targetDate.Date)
        {
            return block.DateRow;
        }
    }

    return null;
}

static DateTime? TryReadDateFromRow(IXLWorksheet worksheet, int rowNumber)
{
    var rightCell = worksheet.Cell(rowNumber, 2);

    if (rightCell.DataType == XLDataType.DateTime)
    {
        return rightCell.GetDateTime();
    }

    if (DateTime.TryParse(rightCell.GetString(), out var parsed))
    {
        return parsed;
    }

    return null;
}

static int FindFooterRow(IXLWorksheet worksheet, int firstRoleRow)
{
    var usedLastRow = worksheet.LastRowUsed()?.RowNumber() ?? firstRoleRow;

    for (int row = firstRoleRow; row <= usedLastRow; row++)
    {
        var text = worksheet.Cell(row, 1).GetString().Trim();

        if (text.StartsWith("Earliest Leave Versus Latest Return", StringComparison.OrdinalIgnoreCase))
        {
            return row;
        }
    }

    return -1;
}

static int FindFooterRowWithinBlock(IXLWorksheet worksheet, int firstRoleRow, int maxRow)
{
    for (int row = firstRoleRow; row <= maxRow; row++)
    {
        var text = worksheet.Cell(row, 1).GetString().Trim();

        if (text.StartsWith("Earliest Leave Versus Latest Return", StringComparison.OrdinalIgnoreCase))
        {
            return row;
        }
    }

    return -1;
}

class DateBlockInfo
{
    public int DateRow { get; set; }
    public DateTime Date { get; set; }
}