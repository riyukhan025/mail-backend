export default function handler(req, res) {
  console.log("Test function invoked");
  res.status(200).json({ message: "Serverless API is live!" });
}
