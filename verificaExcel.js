const fs = require("fs");

const originale = fs.readFileSync("cantieri.xlsx");
const backup = fs.readFileSync("cantieri_backup.xlsx");

if (Buffer.compare(originale, backup) === 0) {
  console.log("✅ Il file Excel NON è stato modificato.");
} else {
  console.log("❌ Il file Excel È STATO modificato.");
}