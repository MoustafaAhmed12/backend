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

// Send email endpoint
app.post("/send-email", async (req, res) => {
  try {
    const { templateName, emails, subject } = req.body;
    const filePath = path.join("templates", templateName);

    // read html template
    const htmlContent = fs.readFileSync(filePath, "utf-8");

    // transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
      },
    });

    let attachments = [];

if (templateName === "email1.html") {
  attachments.push({
    filename: "1.jpeg",
    path: path.join("templates", "images", "1.jpeg"),
    cid: "image1"
  });
} else if (templateName === "email2.html") {
  attachments.push({
    filename: "email2.jpeg",
    path: path.join("templates", "images", "email2.jpeg"),
    cid: "image2"
  });
} else {
  attachments.push({
    filename: "email3.jpeg",
    path: path.join("templates", "images", "email3.jpeg"),
    cid: "image3"
  });
}

 const info = await transporter.sendMail({
  from: `"Moustafa Ahmed" <${process.env.EMAIL}>`,
  to: emails,
  subject,
  html: htmlContent,
  attachments,
});

    console.log(info.messageId);
    res.json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error sending emails" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
