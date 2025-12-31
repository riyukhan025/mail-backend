import axios from "axios";
import { google } from "googleapis";
import nodemailer from "nodemailer";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { to, subject, body, attachments = [] } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).send("Missing required email fields.");
  }

  try {
    // Download attachments
    const downloadedAttachments = [];
    for (const attachment of attachments) {
      if (attachment.url) {
        const response = await axios.get(attachment.url, { responseType: "arraybuffer" });
        downloadedAttachments.push({
          filename: attachment.filename,
          content: response.data,
          contentType: "application/pdf",
        });
      }
    }

    // Get Access Token & Send Email
    const accessToken = await oAuth2Client.getAccessToken();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: GMAIL_USER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    await transporter.sendMail({
      from: `"Spacesolutions" <${GMAIL_USER}>`,
      to,
      subject,
      text: body,
      attachments: downloadedAttachments,
    });

    return res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("[API] Email error:", error);
    return res.status(500).json({ message: "Failed to send email", error: error.toString() });
  }
}