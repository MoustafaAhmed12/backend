import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// ------- CONFIG SMTP HOSTINGER -------

// Mail accounts configurations
const mailers = {
  "info@domain.com": {
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: "info@domain.com", pass: "PASS1" },
  },
  "sales@domain.com": {
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: "sales@domain.com", pass: "PASS2" },
  },
  "support@domain.com": {
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: "support@domain.com", pass: "PASS3" },
  },
  "marketing@domain.com": {
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: "marketing@domain.com", pass: "PASS4" },
  },
};

function logResult(email, status, error = null) {
  const logsFile = "logs.json";
  let logs = [];
  if (fs.existsSync(logsFile)) {
    logs = JSON.parse(fs.readFileSync(logsFile, "utf-8"));
  }
  logs.push({
    email,
    status,
    error,
    date: new Date().toISOString(),
  });
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
}

// ----------- BATCH SEND FUNCTION -----------
async function sendBatch(
  fromEmail, // NEW ✅
  emails,
  htmlContent,
  subject,
  batchSize = 20,
  delayMs = 30000
) {
  let current = 0;

  // صنع transporter بناءً على الإيميل المُرسل المختار
  const transporter = nodemailer.createTransport(mailers[fromEmail]);

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const batch = emails.slice(current, current + batchSize);

      if (batch.length === 0) {
        clearInterval(interval);
        console.log("✅ All emails sent!");
        return resolve();
      }

      try {
        await transporter.sendMail({
          from: `"Academia Globe" <${fromEmail}>`, // NEW ✅
          to: batch,
          subject,
          html: htmlContent,
        });

        batch.forEach((e) => logResult(e, "sent"));
        console.log("✔️ Sent batch from:", fromEmail, "to:", batch);
        current += batchSize;
      } catch (err) {
        batch.forEach((e) => logResult(e, "fail", err.message));
        console.error(`❌ Error sending batch from ${fromEmail}:`, err);
        clearInterval(interval);
        reject(err);
      }
    }, delayMs);
  });
}

// ----------- API ENDPOINT -----------
app.post("/send-email", async (req, res) => {
  try {
    const { fromEmail, templateName, emails, subject } = req.body;
    const filePath = path.join("templates", templateName);

    const htmlContent = fs.readFileSync(filePath, "utf-8");

    await sendBatch(fromEmail, emails, htmlContent, subject);

    res.json({ success: true, message: "Started sending emails in batches!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error sending emails" });
  }
});

// New logs endpoint
app.get("/logs", (req, res) => {
  try {
    if (!fs.existsSync("logs.json")) {
      return res.json([]); // in case no log file yet
    }
    const logs = JSON.parse(fs.readFileSync("logs.json", "utf-8"));
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error reading logs file" });
  }
});

// -----------------------------------------
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
