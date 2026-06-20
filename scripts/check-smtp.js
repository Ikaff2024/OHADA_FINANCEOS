import { verifyMailer } from "../src/mailer.js";

try {
  const result = await verifyMailer();
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Verification SMTP impossible: ${error.message}`);
  process.exit(1);
}
