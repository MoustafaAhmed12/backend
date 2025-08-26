import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Server } from "socket.io";
import http from "http";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
const server = http.createServer(app); // socket.io محتاج http server
const io = new Server(server, {
  cors: {
    origin: "*", // ممكن تحدد الدومين بتاعك
    methods: ["GET", "POST"],
  },
});

app.use(bodyParser.json());
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Mail accounts configurations
const mailers = {
  "info@academiaglobe.com": {
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: "info@academiaglobe.com", pass: "P@$$w0rd@15478#@" },
  },
};

function readLogs() {
  const logsFile = "logs.json";

  if (!fs.existsSync(logsFile)) {
    return [];
  }

  const content = fs.readFileSync(logsFile, "utf-8").trim();

  if (!content) {
    return [];
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("⚠️ Error parsing logs.json:-", err.message);
    return [];
  }
}

// ------------- LOG FUNCTION ----------------
function logResult(id, email, status, error = null) {
  const logsFile = "logs.json";
  let logs = readLogs();
  const logEntry = {
    id,
    email,
    status,
    error,
    date: new Date().toISOString(),
  };
  logs.push(logEntry);
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));

  // 🔥 ابعت الحالة للـ frontend عبر socket.io
  io.emit("emailStatus", logEntry);
}

// ----------- BATCH SEND FUNCTION -----------
async function sendBatch(
  fromEmail,
  emails,
  htmlContent,
  subject,
  batchSize = 20,
  delayMs = 30000
) {
  let current = 0;
  const transporter = nodemailer.createTransport(mailers[fromEmail]);

  // const transporter = nodemailer.createTransport({
  //   service: "gmail",
  //   auth: {
  //     user: process.env.EMAIL,
  //     pass: process.env.APP_PASSWORD,
  //   },
  // });

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const batch = emails.slice(current, current + batchSize);

      if (batch.length === 0) {
        clearInterval(interval);
        console.log("✅ All emails sent!");
        return resolve();
      }

      try {
        for (const email of batch) {
          if (isUnsubscribed(email)) {
            console.log(`⏩ Skipping unsubscribed: ${email}`);
            continue;
          }
          const id = uuidv4();
          const trackedHtml = `
            ${htmlContent.replace(/{{EMAIL}}/g, email)}
            <img src="https://backend-production-1e98.up.railway.app/track/${id}.png" 
                 alt="" style="display:none;width:1px;height:1px;" />
          `;

          await transporter.sendMail({
            // from: `"Academia Globe" <${fromEmail}>`,
            from: `"Academia Globe" <${fromEmail}>`,
            to: email,
            subject,
            html: trackedHtml,
            headers: {
              "List-Unsubscribe": `<mailto:${fromEmail}>, <https://backend-production-1e98.up.railway.app/unsubscribe?email=${email}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });

          logResult(id, email, "sent");
          console.log(`✔️ Sent to: ${email} (id: ${id})`);
        }

        current += batchSize;
      } catch (err) {
        batch.forEach((e) => logResult(uuidv4(), e, "fail", err.message));
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

// ----------- TRACKING ENDPOINT -----------
app.get("/track/:id.png", (req, res) => {
  const { id } = req.params;
  const logsFile = "logs.json";
  if (fs.existsSync(logsFile)) {
    const logs = JSON.parse(fs.readFileSync(logsFile, "utf-8"));
    const log = logs.find((l) => l.id === id.replace(".png", ""));
    if (log) {
      log.status = "opened";
      fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
      io.emit("emailStatus", log);
    }
  }

  // رجع صورة شفافة صغيرة
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAjIBgU7tYKgAAAAASUVORK5CYII=",
    "base64"
  );
  res.setHeader("Content-Type", "image/png");
  res.send(pixel);
});

// ----------- LOGS ENDPOINT -----------
app.get("/logs", (req, res) => {
  try {
    if (!fs.existsSync("logs.json")) return res.json([]);
    const logs = JSON.parse(fs.readFileSync("logs.json", "utf-8"));
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error reading logs file" });
  }
});

app.get("/unsubscribed", (req, res) => {
  try {
    if (!fs.existsSync("unsubscribed.json")) return res.json([]);
    const data = fs.readFileSync(filePath, "utf-8");
    const unsubscribed = JSON.parse(data);

    res.json({
      success: true,
      count: unsubscribed.length,
      data: unsubscribed,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error reading unsubscribed list",
    });
  }
});

app.get("/unsubscribe", (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send("❌ Email is required");
  }

  // سجل الإيميل كـ unsubscribed
  let unsubscribedFile = "unsubscribed.json";
  let list = [];
  if (fs.existsSync(unsubscribedFile)) {
    list = JSON.parse(fs.readFileSync(unsubscribedFile, "utf-8"));
  }

  if (!list.includes(email)) {
    list.push(email);
    fs.writeFileSync(unsubscribedFile, JSON.stringify(list, null, 2));
  }

  res.send(`
    <html>
      <body style="font-family: Arial; text-align: center; padding: 40px;">
        <h2>✅ تم إلغاء الاشتراك بنجاح</h2>
        <p>لن يصلك المزيد من الرسائل من Academia Globe.</p>
      </body>
    </html>
  `);
});

function isUnsubscribed(email) {
  const unsubscribedFile = "unsubscribed.json";
  if (!fs.existsSync(unsubscribedFile)) return false;
  const list = JSON.parse(fs.readFileSync(unsubscribedFile, "utf-8"));
  return list.includes(email);
}

// -----------------------------------------
// socket events
io.on("connection", (socket) => {
  console.log("🟢 عميل متصل:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 عميل فصل:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Server running with Socket.io ✅");
});
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

/*

    <tr>
              <td
               
                style="color: white; text-align: center; padding: 30px"
              >
                <div style="    text-align: center;
                font-size: 14px;
                color: #777;
                margin-top: 20px; margin-bottom: 6px;">
                  إذا كنت لا ترغب في استلام رسائلنا مجددًا،
                </div>
                <a
                  href="https://backend-production-1e98.up.railway.app/unsubscribe?email={{EMAIL}}"
                  style="
                    color: #007bff;
                    text-decoration: none;
                    font-weight: bold;
                  "
                >
                  اضغط هنا لإلغاء الاشتراك
                </a>
              </td>
            </tr>

*/
