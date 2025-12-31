// ------------------- Imports ------------------- //
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const admin = require("firebase-admin");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");

// ------------------- App Setup ------------------- //
const app = express();
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads/" });

// Log all requests
app.use((req, res, next) => {
  console.log(
    `[Server Request] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from ${req.ip}`
  );
  next();
});

console.log("[Server] Initializing...");

// ------------------- Firebase Setup ------------------- //
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

console.log("[Server] Firebase Admin Initialized");

// ------------------- Gmail OAuth2 Setup ------------------- //
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function createTransporter() {
  console.log("[OAuth2] Getting new access token...");
  const accessToken = await oAuth2Client.getAccessToken();
  console.log("[OAuth2] Access token received.");

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

// ------------------- Email Route ------------------- //
app.post("/send-email", async (req, res) => {
  console.log("[SERVER] Received /send-email request.");
  const { to, subject, body, attachments = [] } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).send("Missing required email fields.");
  }

  try {
    const downloadedAttachments = [];

    for (const attachment of attachments) {
      if (attachment.url) {
        console.log(`[SERVER] Downloading ${attachment.filename}`);
        const response = await axios.get(attachment.url, {
          responseType: "arraybuffer",
        });

        downloadedAttachments.push({
          filename: attachment.filename,
          content: response.data,
          contentType: "application/pdf",
        });
      }
    }

    const transporter = await createTransporter();

    await transporter.sendMail({
      from: '"Spacesolutions" <spacesolution2016@gmail.com>',
      to,
      subject,
      text: body,
      attachments: downloadedAttachments,
    });

    console.log("[SERVER] ✅ Email sent successfully!");
    res.status(200).send("Email sent successfully");
  } catch (error) {
    console.error("[SERVER] ❌ Email error:", error);
    res.status(500).send("Failed to send email");
  }
});

// ------------------- Cron Job ------------------- //
cron.schedule(
  "59 23 * * *",
  async () => {
    console.log("[Cron] Running daily reset...");
  },
  { timezone: "Asia/Kolkata" }
);

// ------------------- Start Server ------------------- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Running on port ${PORT}`);
});
