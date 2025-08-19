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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
      },
    });


// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: Number(process.env.SMTP_PORT),
//   secure: process.env.SMTP_SECURE === "true",
//   auth: {
//     user: process.env.EMAIL,
//     pass: process.env.EMAIL_PASS,
//   },
// });

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
  emails,
  htmlContent,
  subject,
  batchSize = 20,
  delayMs = 30000
) {
  let current = 0;

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
          from: `"Academia Globe" <${process.env.EMAIL}>`,
          to: batch, // array → nodemailer سيأخذ أول 20 في الرسالة
          subject,
          html: htmlContent,
        });
        batch.forEach((e) => logResult(e, "sent"));
        console.log("✔️ Sent batch to:", batch);
        current += batchSize;
      } catch (err) {
        batch.forEach((e) => logResult(e, "fail", err.message));
        console.error("❌ Error sending batch: ", err);
        clearInterval(interval);
        reject(err);
      }
    }, delayMs);
  });
}

// ----------- API ENDPOINT -----------
app.post("/send-email", async (req, res) => {
  try {
    const { templateName, emails, subject } = req.body;
    const filePath = path.join("templates", templateName);

    const htmlContent = fs.readFileSync(filePath, "utf-8");

    await sendBatch(emails, htmlContent, subject);

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
