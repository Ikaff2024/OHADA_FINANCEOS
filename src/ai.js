import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

let guideFileUri = null;

async function uploadGuide() {
  if (!ai) {
    console.warn("GEMINI_API_KEY non defini, upload du guide annule.");
    return;
  }

  try {
    console.log("Upload du Guide SYSCOHADA vers Gemini API en cours...");
    const filePath = path.join(__dirname, "..", "Guide-d-application-du-SYSCOHADA.pdf");

    if (!fs.existsSync(filePath)) {
      console.error("Fichier Guide-d-application-du-SYSCOHADA.pdf introuvable.");
      return;
    }

    const fileResult = await ai.files.upload({
      file: filePath,
      mimeType: "application/pdf",
      displayName: "Guide SYSCOHADA"
    });

    console.log("Fichier uploade. Attente du traitement par Gemini...");
    let fileInfo = await ai.files.get({ name: fileResult.name });
    while (fileInfo.state === "PROCESSING") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fileInfo = await ai.files.get({ name: fileResult.name });
    }

    if (fileInfo.state === "FAILED") {
      throw new Error("Le traitement du fichier a echoue cote API.");
    }

    guideFileUri = fileResult.uri;
    console.log("Guide SYSCOHADA pret :", guideFileUri);
    return guideFileUri;
  } catch (error) {
    console.error("Erreur lors de l'upload du guide :", error);
    throw error;
  }
}

// Upload the reference guide at most once; concurrent callers share the same
// in-flight upload. Resets on failure so a later call can retry.
let guideUploadPromise = null;
function ensureGuideUploaded() {
  if (!ai || guideFileUri) return Promise.resolve(guideFileUri);
  if (!guideUploadPromise) {
    guideUploadPromise = uploadGuide().catch((error) => {
      guideUploadPromise = null;
      throw error;
    });
  }
  return guideUploadPromise;
}

// Pre-upload the guide at server startup so the first user question is fast.
export async function warmupAssistant() {
  if (!ai) return;
  try {
    await ensureGuideUploaded();
  } catch {
    /* already logged in uploadGuide; will retry on first question */
  }
}

export async function askAssistant(userMessage, chatHistory = []) {
  if (!ai) {
    throw new Error(
      "La cle API Gemini n'est pas configuree. Ajoutez GEMINI_API_KEY dans votre fichier .env."
    );
  }

  await ensureGuideUploaded();

  if (!guideFileUri) {
    throw new Error("Impossible de charger le document de reference OHADA.");
  }

  const systemInstruction = `Tu es le "Copilot Comptable", l'assistant IA officiel de OHADA FinanceOS.
Tu aides les utilisateurs a comprendre et appliquer les regles comptables du SYSCOHADA.
Tu te bases EXCLUSIVEMENT sur le document fourni (Guide d'application du SYSCOHADA).
Si la reponse ne s'y trouve pas, dis-le poliment. Ne donne jamais de conseils fiscaux ou legaux non fondes sur ce guide.
Sois concis, clair, utilise le format Markdown, et donne des exemples pratiques ou des numeros de compte si possible.`;

  const contents = chatHistory.map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: message.content }]
  }));

  contents.push({
    role: "user",
    parts: [
      { fileData: { fileUri: guideFileUri, mimeType: "application/pdf" } },
      { text: userMessage }
    ]
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction
    }
  });

  return response.text;
}
