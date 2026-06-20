import assert from "node:assert/strict";
import { createServer } from "node:net";

const port = Number(process.env.SMTP_TEST_PORT || 2525);
const messages = [];
const server = createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 localhost OHADA SMTP test\r\n");

  let buffer = "";
  let dataMode = false;
  let message = "";

  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n");
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);

      if (dataMode) {
        if (line === ".") {
          messages.push(message);
          message = "";
          dataMode = false;
          socket.write("250 Message accepted\r\n");
        } else {
          message += `${line}\r\n`;
        }
        continue;
      }

      const command = line.toUpperCase();
      if (command.startsWith("EHLO")) socket.write("250-localhost\r\n250 PIPELINING\r\n");
      else if (command.startsWith("HELO")) socket.write("250 localhost\r\n");
      else if (command.startsWith("MAIL FROM:")) socket.write("250 Sender accepted\r\n");
      else if (command.startsWith("RCPT TO:")) socket.write("250 Recipient accepted\r\n");
      else if (command === "DATA") {
        dataMode = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (command === "QUIT") {
        socket.write("221 Bye\r\n");
        socket.end();
      } else socket.write("250 OK\r\n");
    }
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

try {
  process.env.APP_URL = "http://financeos.test";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.SMTP_FROM = "noreply@financeos.test";

  const { sendInvitationEmail, sendPasswordResetEmail, verifyMailer } = await import(`../src/mailer.js?test=${Date.now()}`);
  const verification = await verifyMailer();
  assert.equal(verification.ok, true);

  await sendInvitationEmail({ email: "invite@financeos.test", name: "Invite Test" }, "invite-token-test");
  await sendPasswordResetEmail({ email: "reset@financeos.test", name: "Reset Test" }, "reset-token-test");

  assert.equal(messages.length, 2);
  assert.match(messages[0], /Invitation a rejoindre OHADA FinanceOS/);
  assert.match(messages[0], /http:\/\/financeos\.test\?token=invite-token-test/);
  assert.match(messages[1], /Reinitialisation de votre mot de passe/);
  assert.match(messages[1], /http:\/\/financeos\.test\?token=reset-token-test/);
  console.log("Checks SMTP local OK");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
