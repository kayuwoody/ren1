
import { Router } from "express";
import { Fiuu } from "../lib/fiuu";
import express from "express";

const router = Router();
const fiuu = new Fiuu(
  process.env.FIUU_MERCHANT_ID!,
  process.env.FIUU_VERIFY_KEY!,
  process.env.FIUU_SECRET_KEY!
);

router.post("/webhook/fiuu", express.urlencoded({ extended: true }), async (req, res) => {
  const body = req.body;
  const valid = fiuu.verifyCallback(body);

  if (!valid) {
    console.error("Invalid FIUU skey", body);
    return res.status(400).send("bad skey");
  }

  // TODO: Update DB - body.status === "00" => success
  console.log("FIUU CALLBACK", body);

  return res.send("OK");
});

export default router;
